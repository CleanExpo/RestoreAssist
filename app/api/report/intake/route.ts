import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    // 1. Validate API key from header
    const apiKey = req.headers.get('X-API-Key');
    const validApiKey = process.env.INTAKE_API_KEY;

    if (!apiKey || !validApiKey || apiKey !== validApiKey) {
      return NextResponse.json(
        { error: 'Invalid or missing API key' },
        { status: 401 }
      );
    }

    // 2. Parse JSON body or multipart form
    const contentType = req.headers.get('content-type') || '';

    let file: File | null = null;
    let metadata: any = {};

    if (contentType.includes('multipart/form-data')) {
      // Handle multipart upload
      const formData = await req.formData();
      file = formData.get('file') as File;

      // Extract optional metadata
      const metadataStr = formData.get('metadata') as string;
      if (metadataStr) {
        try {
          metadata = JSON.parse(metadataStr);
        } catch (e) {
          console.warn('Invalid metadata JSON:', e);
        }
      }
    } else if (contentType.includes('application/json')) {
      // Handle base64-encoded file in JSON
      const body = await req.json();

      if (!body.file_data || !body.file_name) {
        return NextResponse.json(
          { error: 'Missing file_data or file_name in JSON payload' },
          { status: 400 }
        );
      }

      // Decode base64
      const buffer = Buffer.from(body.file_data, 'base64');
      file = new File([buffer], body.file_name, {
        type: body.mime_type || 'application/pdf'
      });

      metadata = body.metadata || {};
    } else {
      return NextResponse.json(
        { error: 'Content-Type must be multipart/form-data or application/json' },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF and DOCX allowed.' },
        { status: 400 }
      );
    }

    // Validate file size (max 50MB)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 50MB.' },
        { status: 400 }
      );
    }

    // 3. Upload to Supabase Storage
    const fileBuffer = await file.arrayBuffer();
    const fileName = `${Date.now()}_${file.name}`;
    const storagePath = `reports/api/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin
      .storage
      .from('reports')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file to storage' },
        { status: 500 }
      );
    }

    // 4. Create database record
    const { data: reportUpload, error: dbError } = await supabaseAdmin
      .from('report_uploads')
      .insert({
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        storage_path: storagePath,
        uploaded_by: null, // API uploads don't have associated users
        upload_source: metadata.source || 'api',
        status: 'pending'
      })
      .select('id, file_name, status, created_at')
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      // Clean up storage if DB insert fails
      await supabaseAdmin.storage.from('reports').remove([storagePath]);
      return NextResponse.json(
        { error: 'Failed to create upload record' },
        { status: 500 }
      );
    }

    // 5. Trigger async parsing job
    const parserServiceUrl = process.env.PARSER_SERVICE_URL || 'http://parser-service:5001';

    // Fire-and-forget async parsing request
    fetch(`${parserServiceUrl}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upload_id: reportUpload.id,
        storage_path: storagePath,
        mime_type: file.type,
        metadata: metadata
      })
    }).catch(err => {
      console.error('Failed to trigger parser:', err);
      // Don't fail the upload request if parser is unavailable
    });

    // 6. Optional webhook callback
    if (metadata.webhook_url) {
      fetch(metadata.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'report.uploaded',
          upload_id: reportUpload.id,
          file_name: file.name,
          status: 'pending',
          timestamp: new Date().toISOString()
        })
      }).catch(err => {
        console.error('Webhook callback failed:', err);
        // Don't fail the request if webhook fails
      });
    }

    return NextResponse.json({
      success: true,
      upload_id: reportUpload.id,
      file_name: reportUpload.file_name,
      status: reportUpload.status,
      created_at: reportUpload.created_at,
      message: 'File uploaded successfully. Processing started.'
    }, { status: 201 });

  } catch (error) {
    console.error('Intake error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
