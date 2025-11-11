#!/usr/bin/env python3
"""
Report Parser Service for RestoreAssist
Extracts text from PDFs/DOCX, analyzes with Claude AI, stores structured results in Supabase
"""

import os
import io
import json
import logging
import requests
from datetime import datetime
from flask import Flask, request, jsonify
from supabase import create_client, Client
from anthropic import Anthropic

# PDF/DOCX parsing libraries
from pdfminer.high_level import extract_text as extract_pdf_text
from docx import Document

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Initialize Supabase client
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Initialize Anthropic client (Claude)
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')
anthropic_client = Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None


# ========== Helper Functions ==========

def parse_file(file_bytes: bytes, mime_type: str) -> str:
    """Extract text from PDF or DOCX"""
    try:
        if mime_type == 'application/pdf':
            text = extract_pdf_text(io.BytesIO(file_bytes))
            return text.strip()
        elif mime_type == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            doc = Document(io.BytesIO(file_bytes))
            paragraphs = [para.text for para in doc.paragraphs if para.text.strip()]
            return '\n'.join(paragraphs).strip()
        else:
            raise ValueError(f'Unsupported MIME type: {mime_type}')
    except Exception as e:
        logger.error(f"Text extraction error: {e}")
        raise


def quick_classify(text: str) -> dict:
    """Quick keyword-based classification for service type"""
    text_lower = text.lower()

    keyword_map = {
        "water": {"service_type": "Water Damage", "standard": "S500"},
        "mould": {"service_type": "Mould Remediation", "standard": "S520"},
        "mold": {"service_type": "Mould Remediation", "standard": "S520"},
        "fire": {"service_type": "Fire & Smoke", "standard": "S700"},
        "smoke": {"service_type": "Fire & Smoke", "standard": "S700"},
        "bio": {"service_type": "Biohazard", "standard": "S540"},
        "crime": {"service_type": "Crime Scene", "standard": "S540"},
    }

    for keyword, classification in keyword_map.items():
        if keyword in text_lower:
            return classification

    return {"service_type": "General", "standard": None}


def analyse_with_claude(text: str) -> dict:
    """
    Use Claude AI to analyze report and return structured JSON
    Uses claude_prompt_template.json for schema and instructions
    """
    if not anthropic_client:
        logger.warning("No Anthropic API key configured - using fallback classification")
        return {
            "report_grade": 2,
            "service_type": "General",
            "summary": "AI analysis unavailable - no API key",
            "sections": [],
            "hazards": [],
            "detected_standards": [],
            "questions": []
        }

    try:
        # Load prompt template
        prompt_file = "/app/claude_prompt_template.json"
        with open(prompt_file, 'r') as f:
            template = json.load(f)

        # Truncate text if too long (Claude has token limits)
        max_chars = 16000
        truncated_text = text[:max_chars]
        if len(text) > max_chars:
            truncated_text += '\n\n[Text truncated for analysis...]'

        # Build prompt from template
        prompt = (
            f"{template['instruction']}\n\n"
            f"**Context:**\n{json.dumps(template['context'], indent=2)}\n\n"
            f"**Schema:**\n{json.dumps(template['schema'], indent=2)}\n\n"
            f"**Instructions:**\n" + "\n".join(f"- {i}" for i in template['instructions']) + "\n\n"
            f"### REPORT TEXT ###\n{truncated_text}"
        )

        logger.info("Sending report to Claude for analysis...")

        message = anthropic_client.messages.create(
            model="claude-3-5-sonnet-20241022",  # Use Sonnet for cost-effectiveness
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}]
        )

        raw_response = message.content[0].text.strip()
        logger.info(f"Claude response received: {len(raw_response)} chars")

        # Parse JSON response
        # Remove markdown code fences if present
        if raw_response.startswith('```'):
            lines = raw_response.split('\n')
            # Remove first and last lines (``` json and ```)
            raw_response = '\n'.join(lines[1:-1])

        result = json.loads(raw_response)

        # Validate required fields
        result.setdefault('report_grade', 2)
        result.setdefault('service_type', 'General')
        result.setdefault('summary', '')
        result.setdefault('sections', [])
        result.setdefault('hazards', [])
        result.setdefault('detected_standards', [])
        result.setdefault('questions', [])

        return result

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response as JSON: {e}")
        logger.error(f"Response was: {raw_response[:500]}")
        return {
            "report_grade": 2,
            "service_type": "General",
            "summary": f"AI response parsing failed: {str(e)}",
            "sections": [],
            "hazards": [],
            "detected_standards": [],
            "questions": [],
            "raw_response": raw_response
        }
    except Exception as e:
        logger.error(f"AI classification error: {e}", exc_info=True)
        return {
            "report_grade": 2,
            "service_type": "General",
            "summary": f"AI classification failed: {str(e)}",
            "sections": [],
            "hazards": [],
            "detected_standards": [],
            "questions": []
        }


def store_results(report_id: str, full_text: str, ai_result: dict):
    """
    Store analysis results in Supabase
    - Updates report_uploads with metadata
    - Creates report_analysis record with structured data
    """
    try:
        # Store full analysis
        analysis_data = {
            'report_upload_id': report_id,
            'full_text': full_text,
            'service_type': ai_result.get('service_type'),
            'confidence_score': 0.9,  # Claude Sonnet is generally high-confidence
            'detected_standards': ai_result.get('detected_standards', []),
            'key_findings': {
                'summary': ai_result.get('summary', ''),
                'sections': ai_result.get('sections', []),
                'hazards': ai_result.get('hazards', []),
                'questions': ai_result.get('questions', []),
                'report_grade': ai_result.get('report_grade', 2)
            },
            'ai_model': 'claude-3-5-sonnet-20241022',
            'prompt_version': '2.0',
            'raw_ai_response': ai_result,
            'analyzed_at': datetime.utcnow().isoformat()
        }

        analysis_result = supabase.table('report_analysis').insert(analysis_data).execute()
        logger.info(f"Analysis stored with ID: {analysis_result.data[0]['id']}")

        # Update upload record with metadata
        supabase.table('report_uploads').update({
            'status': 'completed',
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', report_id).execute()

        logger.info(f"Report {report_id} marked as completed")

    except Exception as e:
        logger.error(f"Error storing results: {e}", exc_info=True)
        raise


# ========== API Routes ==========

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'parser_service',
        'ai_enabled': anthropic_client is not None,
        'version': '2.0',
        'timestamp': datetime.utcnow().isoformat()
    })


@app.route('/parse', methods=['POST'])
def parse_route():
    """
    Main parsing endpoint - downloads file, extracts text, analyzes with AI
    Expected JSON body: { upload_id, storage_path, mime_type }
    """
    try:
        data = request.get_json()
        upload_id = data.get('upload_id')
        storage_path = data.get('storage_path')
        mime_type = data.get('mime_type')

        if not upload_id or not storage_path:
            return jsonify({'error': 'Missing upload_id or storage_path'}), 400

        logger.info(f"Parsing report {upload_id} from {storage_path}")

        # 1. Update status to 'parsing'
        supabase.table('report_uploads').update({
            'status': 'parsing',
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', upload_id).execute()

        # 2. Download file from Supabase Storage
        try:
            file_bytes = supabase.storage.from_('reports').download(storage_path)
        except Exception as e:
            logger.error(f"Failed to download file: {e}")
            supabase.table('report_uploads').update({
                'status': 'failed',
                'error_message': f'Storage download failed: {str(e)}'
            }).eq('id', upload_id).execute()
            return jsonify({'error': 'Failed to download file from storage'}), 500

        # 3. Extract text
        try:
            full_text = parse_file(file_bytes, mime_type)
            logger.info(f"Extracted {len(full_text)} characters from {storage_path}")
        except Exception as e:
            logger.error(f"Text extraction failed: {e}")
            supabase.table('report_uploads').update({
                'status': 'failed',
                'error_message': f'Text extraction failed: {str(e)}'
            }).eq('id', upload_id).execute()
            return jsonify({'error': f'Text extraction failed: {str(e)}'}), 500

        # 4. Analyze with Claude AI
        ai_result = analyse_with_claude(full_text)

        # 5. Store results in database
        store_results(upload_id, full_text, ai_result)

        logger.info(f"Successfully parsed and analyzed report {upload_id}")

        # 6. Trigger question generation (fire-and-forget)
        next_api_url = os.getenv('NEXT_API_URL', 'http://host.docker.internal:3001')
        try:
            requests.get(
                f"{next_api_url}/api/questions/generate?report={upload_id}",
                timeout=5
            )
            logger.info(f"Triggered question generation for report {upload_id}")
        except Exception as e:
            logger.warning(f"Failed to trigger question generation: {e}")
            # Don't fail the request if question generation fails

        return jsonify({
            'success': True,
            'upload_id': upload_id,
            'service_type': ai_result.get('service_type'),
            'report_grade': ai_result.get('report_grade'),
            'text_length': len(full_text),
            'standards_detected': len(ai_result.get('detected_standards', [])),
            'questions_generated': len(ai_result.get('questions', []))
        })

    except Exception as e:
        logger.error(f"Parse error: {e}", exc_info=True)

        # Try to update status to failed
        if upload_id:
            try:
                supabase.table('report_uploads').update({
                    'status': 'failed',
                    'error_message': str(e)
                }).eq('id', upload_id).execute()
            except:
                pass

        return jsonify({'error': str(e)}), 500


@app.route('/analyze', methods=['POST'])
def analyze_route():
    """
    Standalone analysis endpoint - analyze text without storing
    Expected JSON body: { text }
    Returns: Claude AI structured analysis
    """
    try:
        data = request.get_json()
        text = data.get('text', '')

        if not text:
            return jsonify({'error': 'Missing text parameter'}), 400

        logger.info(f"Analyzing {len(text)} characters of text")

        # Analyze with Claude
        result = analyse_with_claude(text)

        return jsonify(result)

    except Exception as e:
        logger.error(f"Analyze error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    logger.info("Starting Parser Service v2.0 on port 5001")
    app.run(host='0.0.0.0', port=5001, debug=False)
