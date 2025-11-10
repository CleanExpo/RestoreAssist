#!/usr/bin/env python3
"""
GoogleDriveResolver - Lightweight service for fetching and caching regulatory/standards files from Google Drive
"""

import os
import json
import logging
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any

from flask import Flask, request, jsonify
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from cachetools import TTLCache
import io

# Initialize Flask app
app = Flask(__name__)

# Load configuration
CONFIG_PATH = os.getenv('CONFIG_PATH', '/app/config.json')
with open(CONFIG_PATH, 'r') as f:
    CONFIG = json.load(f)

# Setup logging
log_dir = Path(CONFIG['logging']['file']).parent
log_dir.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=getattr(logging, CONFIG['logging']['level'].upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(CONFIG['logging']['file']),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize cache
cache_path = Path(CONFIG['cache']['path'])
cache_path.mkdir(parents=True, exist_ok=True)

# In-memory metadata cache with TTL
metadata_cache = TTLCache(
    maxsize=1000,
    ttl=CONFIG['cache']['ttl_hours'] * 3600
)


class DriveResolver:
    """Google Drive API resolver with caching"""

    def __init__(self):
        self.service = None
        self.allowed_folders = set(CONFIG['permissions']['allowed_folders'])
        self._initialize_service()

    def _initialize_service(self):
        """Initialize Google Drive API service"""
        try:
            credentials_path = os.getenv(
                'GOOGLE_APPLICATION_CREDENTIALS',
                CONFIG['security']['credentials_file']
            )

            if not os.path.exists(credentials_path):
                raise FileNotFoundError(f"Credentials file not found: {credentials_path}")

            credentials = service_account.Credentials.from_service_account_file(
                credentials_path,
                scopes=CONFIG['security']['scopes']
            )

            self.service = build('drive', 'v3', credentials=credentials)
            logger.info("Google Drive API service initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize Drive API: {e}")
            raise

    def _check_folder_permission(self, file_id: str) -> bool:
        """Check if file belongs to an allowed folder"""
        try:
            file_metadata = self.service.files().get(
                fileId=file_id,
                fields='parents'
            ).execute()

            parents = file_metadata.get('parents', [])

            # If no specific folders configured, allow all
            if not self.allowed_folders:
                return True

            # Check if any parent is in allowed folders
            for parent in parents:
                if parent in self.allowed_folders:
                    return True

            return False

        except Exception as e:
            logger.error(f"Error checking folder permissions: {e}")
            return False

    def _get_cache_key(self, file_id: str) -> str:
        """Generate cache key for file"""
        return hashlib.sha256(file_id.encode()).hexdigest()

    def _get_cached_file_path(self, file_id: str, file_name: str) -> Path:
        """Get cache file path"""
        cache_key = self._get_cache_key(file_id)
        # Preserve file extension
        extension = Path(file_name).suffix
        return cache_path / f"{cache_key}{extension}"

    def _is_cache_valid(self, file_path: Path) -> bool:
        """Check if cached file is still valid"""
        if not file_path.exists():
            return False

        file_age = datetime.now() - datetime.fromtimestamp(file_path.stat().st_mtime)
        max_age = timedelta(hours=CONFIG['cache']['ttl_hours'])

        return file_age < max_age

    def _cleanup_cache(self):
        """Remove expired cache files and enforce size limit"""
        try:
            total_size = 0
            files_with_age = []

            for file_path in cache_path.glob('*'):
                if file_path.is_file():
                    size = file_path.stat().st_size
                    mtime = file_path.stat().st_mtime
                    files_with_age.append((file_path, size, mtime))
                    total_size += size

            # Remove expired files
            max_age = timedelta(hours=CONFIG['cache']['ttl_hours'])
            now = datetime.now()

            for file_path, size, mtime in files_with_age[:]:
                file_age = now - datetime.fromtimestamp(mtime)
                if file_age > max_age:
                    file_path.unlink()
                    total_size -= size
                    files_with_age.remove((file_path, size, mtime))
                    logger.info(f"Removed expired cache file: {file_path.name}")

            # Enforce size limit
            max_size_bytes = CONFIG['cache']['max_size_mb'] * 1024 * 1024

            if total_size > max_size_bytes:
                # Sort by modification time (oldest first)
                files_with_age.sort(key=lambda x: x[2])

                for file_path, size, _ in files_with_age:
                    if total_size <= max_size_bytes:
                        break
                    file_path.unlink()
                    total_size -= size
                    logger.info(f"Removed cache file to enforce size limit: {file_path.name}")

        except Exception as e:
            logger.error(f"Error cleaning cache: {e}")

    def list_files(self, folder_id: Optional[str] = None, query: Optional[str] = None) -> List[Dict]:
        """List files in Google Drive"""
        try:
            # Build query
            q_parts = []

            if folder_id:
                if folder_id not in self.allowed_folders:
                    raise ValueError(f"Folder {folder_id} is not in allowed folders")
                q_parts.append(f"'{folder_id}' in parents")

            if query:
                q_parts.append(f"name contains '{query}'")

            # Add allowed folders constraint if no specific folder requested
            if not folder_id and self.allowed_folders:
                folder_parts = " or ".join([f"'{fid}' in parents" for fid in self.allowed_folders])
                q_parts.append(f"({folder_parts})")

            q_parts.append("trashed = false")

            query_string = " and ".join(q_parts) if q_parts else "trashed = false"

            results = self.service.files().list(
                q=query_string,
                fields="files(id, name, mimeType, modifiedTime, webViewLink, size)",
                pageSize=100
            ).execute()

            files = results.get('files', [])

            # Format output
            output_fields = CONFIG['output_format']['fields']
            formatted_files = []

            for file in files:
                formatted_file = {}
                if 'fileName' in output_fields:
                    formatted_file['fileName'] = file.get('name')
                if 'fileId' in output_fields:
                    formatted_file['fileId'] = file.get('id')
                if 'mimeType' in output_fields:
                    formatted_file['mimeType'] = file.get('mimeType')
                if 'modifiedTime' in output_fields:
                    formatted_file['modifiedTime'] = file.get('modifiedTime')
                if 'downloadLink' in output_fields:
                    formatted_file['downloadLink'] = file.get('webViewLink')
                if 'size' in output_fields:
                    formatted_file['size'] = file.get('size')

                formatted_files.append(formatted_file)

            logger.info(f"Listed {len(formatted_files)} files")
            return formatted_files

        except Exception as e:
            logger.error(f"Error listing files: {e}")
            raise

    def get_file_metadata(self, file_id: str) -> Dict:
        """Get file metadata"""
        try:
            # Check cache first
            cache_key = f"metadata_{file_id}"
            if cache_key in metadata_cache:
                logger.info(f"Returning cached metadata for {file_id}")
                return metadata_cache[cache_key]

            # Check permissions
            if not self._check_folder_permission(file_id):
                raise PermissionError(f"File {file_id} is not in allowed folders")

            # Fetch from API
            file_metadata = self.service.files().get(
                fileId=file_id,
                fields='id, name, mimeType, modifiedTime, size, webViewLink, parents'
            ).execute()

            # Format output
            output_fields = CONFIG['output_format']['fields']
            formatted_metadata = {}

            if 'fileName' in output_fields:
                formatted_metadata['fileName'] = file_metadata.get('name')
            if 'fileId' in output_fields:
                formatted_metadata['fileId'] = file_metadata.get('id')
            if 'mimeType' in output_fields:
                formatted_metadata['mimeType'] = file_metadata.get('mimeType')
            if 'modifiedTime' in output_fields:
                formatted_metadata['modifiedTime'] = file_metadata.get('modifiedTime')
            if 'downloadLink' in output_fields:
                formatted_metadata['downloadLink'] = file_metadata.get('webViewLink')
            if 'size' in output_fields:
                formatted_metadata['size'] = file_metadata.get('size')

            # Cache metadata
            metadata_cache[cache_key] = formatted_metadata

            logger.info(f"Retrieved metadata for {file_id}")
            return formatted_metadata

        except Exception as e:
            logger.error(f"Error getting file metadata: {e}")
            raise

    def download_file(self, file_id: str, use_cache: bool = True) -> Dict:
        """Download file with caching"""
        try:
            # Check permissions
            if not self._check_folder_permission(file_id):
                raise PermissionError(f"File {file_id} is not in allowed folders")

            # Get file metadata
            metadata = self.get_file_metadata(file_id)
            file_name = metadata['fileName']

            # Check cache
            cached_file_path = self._get_cached_file_path(file_id, file_name)

            if use_cache and self._is_cache_valid(cached_file_path):
                logger.info(f"Returning cached file: {file_name}")
                return {
                    'fileName': file_name,
                    'fileId': file_id,
                    'filePath': str(cached_file_path),
                    'cached': True,
                    'size': cached_file_path.stat().st_size
                }

            # Download from Drive
            logger.info(f"Downloading file from Drive: {file_name}")
            request_obj = self.service.files().get_media(fileId=file_id)

            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request_obj)

            done = False
            while not done:
                status, done = downloader.next_chunk()
                if status:
                    logger.debug(f"Download progress: {int(status.progress() * 100)}%")

            # Save to cache
            with open(cached_file_path, 'wb') as f:
                f.write(fh.getvalue())

            logger.info(f"File downloaded and cached: {file_name}")

            # Cleanup cache if needed
            self._cleanup_cache()

            return {
                'fileName': file_name,
                'fileId': file_id,
                'filePath': str(cached_file_path),
                'cached': False,
                'size': cached_file_path.stat().st_size
            }

        except Exception as e:
            logger.error(f"Error downloading file: {e}")
            raise

    def search_files(self, query: str) -> List[Dict]:
        """Search files by name"""
        return self.list_files(query=query)


# Initialize resolver
resolver = DriveResolver()


# API Routes
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': CONFIG['name'],
        'version': CONFIG['schema_version']
    })


@app.route('/api/list', methods=['GET'])
def list_files():
    """List files in Drive"""
    try:
        folder_id = request.args.get('folderId')
        query = request.args.get('query')

        files = resolver.list_files(folder_id=folder_id, query=query)

        return jsonify({
            'success': True,
            'count': len(files),
            'files': files
        })

    except Exception as e:
        logger.error(f"Error in list_files endpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/file/<file_id>', methods=['GET'])
def get_file(file_id: str):
    """Get file metadata"""
    try:
        metadata = resolver.get_file_metadata(file_id)

        return jsonify({
            'success': True,
            'file': metadata
        })

    except PermissionError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 403

    except Exception as e:
        logger.error(f"Error in get_file endpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/download/<file_id>', methods=['GET'])
def download_file(file_id: str):
    """Download file (returns file info, not the file itself)"""
    try:
        use_cache = request.args.get('cache', 'true').lower() == 'true'

        result = resolver.download_file(file_id, use_cache=use_cache)

        return jsonify({
            'success': True,
            **result
        })

    except PermissionError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 403

    except Exception as e:
        logger.error(f"Error in download_file endpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/search', methods=['GET'])
def search_files():
    """Search files"""
    try:
        query = request.args.get('q')
        if not query:
            return jsonify({
                'success': False,
                'error': 'Query parameter "q" is required'
            }), 400

        files = resolver.search_files(query)

        return jsonify({
            'success': True,
            'count': len(files),
            'files': files
        })

    except Exception as e:
        logger.error(f"Error in search_files endpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/cache/stats', methods=['GET'])
def cache_stats():
    """Get cache statistics"""
    try:
        total_size = 0
        file_count = 0

        for file_path in cache_path.glob('*'):
            if file_path.is_file():
                total_size += file_path.stat().st_size
                file_count += 1

        return jsonify({
            'success': True,
            'cache': {
                'fileCount': file_count,
                'totalSizeMB': round(total_size / (1024 * 1024), 2),
                'maxSizeMB': CONFIG['cache']['max_size_mb'],
                'ttlHours': CONFIG['cache']['ttl_hours'],
                'path': str(cache_path)
            }
        })

    except Exception as e:
        logger.error(f"Error in cache_stats endpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    """Clear all cached files"""
    try:
        removed_count = 0
        removed_size = 0

        for file_path in cache_path.glob('*'):
            if file_path.is_file():
                size = file_path.stat().st_size
                file_path.unlink()
                removed_count += 1
                removed_size += size

        # Clear metadata cache
        metadata_cache.clear()

        return jsonify({
            'success': True,
            'removed': {
                'fileCount': removed_count,
                'totalSizeMB': round(removed_size / (1024 * 1024), 2)
            }
        })

    except Exception as e:
        logger.error(f"Error in clear_cache endpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
