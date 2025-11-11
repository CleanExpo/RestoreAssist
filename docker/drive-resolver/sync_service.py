#!/usr/bin/env python3
"""
Supabase Sync Service for Standards System
Synchronizes parsed standards documents to Supabase PostgreSQL database
"""

import os
import logging
from datetime import datetime
from typing import Dict, List, Optional
from uuid import uuid4

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None
    Client = None

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None

logger = logging.getLogger(__name__)


class SupabaseSyncService:
    """Service for syncing parsed standards to Supabase"""

    def __init__(self, supabase_url: Optional[str] = None,
                 supabase_key: Optional[str] = None,
                 database_url: Optional[str] = None):
        """
        Initialize Supabase sync service

        Args:
            supabase_url: Supabase project URL (or from env)
            supabase_key: Supabase service role key (or from env)
            database_url: Direct PostgreSQL connection URL (or from env)
        """
        self.supabase_url = supabase_url or os.getenv('SUPABASE_URL')
        self.supabase_key = supabase_key or os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_KEY')
        self.database_url = database_url or os.getenv('DATABASE_URL')

        self.supabase_client = None
        self.db_connection = None

        self._initialize_client()

    def _initialize_client(self):
        """Initialize Supabase client or direct DB connection"""
        try:
            # Prefer Supabase REST client (schema should be reloaded first)
            if create_client and self.supabase_url and self.supabase_key:
                self.supabase_client = create_client(self.supabase_url, self.supabase_key)
                logger.info("Initialized Supabase REST client")

            # Fallback to direct PostgreSQL connection
            elif psycopg2 and self.database_url:
                self.db_connection = psycopg2.connect(self.database_url)
                logger.info("Initialized direct PostgreSQL connection")

            else:
                raise Exception("Missing Supabase credentials or database URL")

        except Exception as e:
            logger.error(f"Failed to initialize Supabase connection: {e}")
            raise

    def sync_standard(self, parsed_data: Dict, drive_file_id: str,
                     drive_file_name: str) -> Dict:
        """
        Sync a parsed standard document to Supabase

        Args:
            parsed_data: Parsed document structure from parser
            drive_file_id: Google Drive file ID
            drive_file_name: Original file name

        Returns:
            Sync result dictionary with statistics
        """
        sync_id = str(uuid4())
        start_time = datetime.utcnow()

        stats = {
            'sync_id': sync_id,
            'standards_created': 0,
            'standards_updated': 0,
            'sections_created': 0,
            'sections_updated': 0,
            'clauses_created': 0,
            'clauses_updated': 0,
            'errors': 0,
            'error_messages': []
        }

        try:
            # Extract metadata from parsed data
            metadata = parsed_data.get('metadata', {})

            # Determine standard code from file name
            standard_code = self._extract_standard_code(drive_file_name)
            if not standard_code:
                raise Exception(f"Could not extract standard code from: {drive_file_name}")

            # Create or update Standard record
            standard_id = self._upsert_standard(
                code=standard_code,
                title=self._extract_title(parsed_data, drive_file_name),
                edition=metadata.get('edition'),
                publisher=metadata.get('publisher') or 'IICRC',
                version=metadata.get('version') or '1.0',
                publication_year=metadata.get('publication_year'),
                drive_file_id=drive_file_id,
                drive_file_name=drive_file_name,
                full_text=parsed_data.get('full_text', '')
            )

            if standard_id:
                stats['standards_updated'] += 1
            else:
                stats['standards_created'] += 1

            # Sync sections
            sections = parsed_data.get('sections', [])
            section_map = {}  # Map section numbers to IDs

            for section in sections:
                try:
                    section_id = self._upsert_section(
                        standard_id=standard_id,
                        section_number=section.get('number'),
                        title=section.get('title'),
                        content=section.get('content'),
                        parent_section_id=section_map.get(section.get('parent'))
                    )

                    section_map[section.get('number')] = section_id
                    stats['sections_created'] += 1

                except Exception as e:
                    logger.error(f"Error syncing section {section.get('number')}: {e}")
                    stats['errors'] += 1
                    stats['error_messages'].append(str(e))

            # Sync clauses
            clauses = parsed_data.get('clauses', [])

            for clause in clauses:
                try:
                    self._upsert_clause(
                        standard_id=standard_id,
                        section_id=section_map.get(clause.get('section_number')),
                        clause_number=clause.get('number'),
                        title=clause.get('title'),
                        content=clause.get('content'),
                        category=clause.get('category'),
                        importance=clause.get('importance', 'STANDARD')
                    )

                    stats['clauses_created'] += 1

                except Exception as e:
                    logger.error(f"Error syncing clause {clause.get('number')}: {e}")
                    stats['errors'] += 1
                    stats['error_messages'].append(str(e))

            # Record sync history
            duration = (datetime.utcnow() - start_time).total_seconds()

            self._record_sync_history(
                sync_id=sync_id,
                sync_type='SINGLE_FILE',
                status='COMPLETED' if stats['errors'] == 0 else 'PARTIAL',
                drive_file_id=drive_file_id,
                drive_file_name=drive_file_name,
                stats=stats,
                duration=int(duration)
            )

            stats['status'] = 'success'
            stats['duration_seconds'] = duration

            return stats

        except Exception as e:
            logger.error(f"Sync failed: {e}")
            stats['status'] = 'failed'
            stats['error_messages'].append(str(e))

            # Record failed sync
            self._record_sync_history(
                sync_id=sync_id,
                sync_type='SINGLE_FILE',
                status='FAILED',
                drive_file_id=drive_file_id,
                drive_file_name=drive_file_name,
                stats=stats,
                duration=int((datetime.utcnow() - start_time).total_seconds())
            )

            return stats

    def _upsert_standard(self, code: str, title: str, edition: Optional[str],
                        publisher: str, version: str, publication_year: Optional[str],
                        drive_file_id: str, drive_file_name: str,
                        full_text: str) -> str:
        """Upsert Standard record"""

        standard_data = {
            'code': code,
            'title': title,
            'edition': edition,
            'publisher': publisher,
            'version': version,
            'driveFileId': drive_file_id,
            'driveFileName': drive_file_name,
            'lastSyncedAt': datetime.utcnow().isoformat(),
            'status': 'ACTIVE',
            'updatedAt': datetime.utcnow().isoformat()
        }

        if publication_year:
            try:
                standard_data['publicationDate'] = f"{publication_year}-01-01T00:00:00.000Z"
            except:
                pass

        if self.supabase_client:
            # Use Supabase REST API
            try:
                # Try to find existing standard by code
                existing = self.supabase_client.table('Standard') \
                    .select('id') \
                    .eq('code', code) \
                    .execute()

                if existing.data:
                    # Update existing
                    standard_id = existing.data[0]['id']
                    self.supabase_client.table('Standard') \
                        .update(standard_data) \
                        .eq('id', standard_id) \
                        .execute()
                else:
                    # Create new
                    standard_id = f"std_{code.lower()}_{uuid4().hex[:8]}"
                    standard_data['id'] = standard_id
                    standard_data['createdAt'] = datetime.utcnow().isoformat()

                    self.supabase_client.table('Standard') \
                        .insert(standard_data) \
                        .execute()

                return standard_id

            except Exception as e:
                logger.error(f"Supabase upsert failed: {e}")
                raise

        elif self.db_connection:
            # Use direct SQL
            cursor = self.db_connection.cursor()
            try:
                # Check if exists
                cursor.execute('SELECT id FROM "Standard" WHERE code = %s', (code,))
                existing = cursor.fetchone()

                if existing:
                    standard_id = existing[0]
                    # Update
                    cursor.execute('''
                        UPDATE "Standard"
                        SET title = %s, edition = %s, publisher = %s, version = %s,
                            "driveFileId" = %s, "driveFileName" = %s,
                            "lastSyncedAt" = %s, "updatedAt" = %s
                        WHERE id = %s
                    ''', (title, edition, publisher, version, drive_file_id,
                          drive_file_name, datetime.utcnow(), datetime.utcnow(), standard_id))
                else:
                    # Insert
                    standard_id = f"std_{code.lower()}_{uuid4().hex[:8]}"
                    cursor.execute('''
                        INSERT INTO "Standard"
                        (id, code, title, edition, publisher, version, "driveFileId",
                         "driveFileName", "lastSyncedAt", status, "createdAt", "updatedAt")
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ''', (standard_id, code, title, edition, publisher, version,
                          drive_file_id, drive_file_name, datetime.utcnow(),
                          'ACTIVE', datetime.utcnow(), datetime.utcnow()))

                self.db_connection.commit()
                return standard_id

            except Exception as e:
                self.db_connection.rollback()
                logger.error(f"SQL upsert failed: {e}")
                raise
            finally:
                cursor.close()

    def _upsert_section(self, standard_id: str, section_number: str,
                       title: str, content: Optional[str],
                       parent_section_id: Optional[str]) -> str:
        """Upsert StandardSection record"""

        section_data = {
            'standardId': standard_id,
            'sectionNumber': section_number,
            'title': title,
            'content': content,
            'parentSectionId': parent_section_id,
            'updatedAt': datetime.utcnow().isoformat()
        }

        if self.supabase_client:
            try:
                # Find existing
                existing = self.supabase_client.table('StandardSection') \
                    .select('id') \
                    .eq('standardId', standard_id) \
                    .eq('sectionNumber', section_number) \
                    .execute()

                if existing.data:
                    section_id = existing.data[0]['id']
                    self.supabase_client.table('StandardSection') \
                        .update(section_data) \
                        .eq('id', section_id) \
                        .execute()
                else:
                    section_id = str(uuid4())
                    section_data['id'] = section_id
                    section_data['createdAt'] = datetime.utcnow().isoformat()

                    self.supabase_client.table('StandardSection') \
                        .insert(section_data) \
                        .execute()

                return section_id

            except Exception as e:
                logger.error(f"Section upsert failed: {e}")
                raise

        elif self.db_connection:
            cursor = self.db_connection.cursor()
            try:
                cursor.execute('''
                    SELECT id FROM "StandardSection"
                    WHERE "standardId" = %s AND "sectionNumber" = %s
                ''', (standard_id, section_number))
                existing = cursor.fetchone()

                if existing:
                    section_id = existing[0]
                    cursor.execute('''
                        UPDATE "StandardSection"
                        SET title = %s, content = %s, "parentSectionId" = %s, "updatedAt" = %s
                        WHERE id = %s
                    ''', (title, content, parent_section_id, datetime.utcnow(), section_id))
                else:
                    section_id = str(uuid4())
                    cursor.execute('''
                        INSERT INTO "StandardSection"
                        (id, "standardId", "sectionNumber", title, content,
                         "parentSectionId", "createdAt", "updatedAt")
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ''', (section_id, standard_id, section_number, title, content,
                          parent_section_id, datetime.utcnow(), datetime.utcnow()))

                self.db_connection.commit()
                return section_id

            except Exception as e:
                self.db_connection.rollback()
                raise
            finally:
                cursor.close()

    def _upsert_clause(self, standard_id: str, section_id: Optional[str],
                      clause_number: str, title: Optional[str], content: str,
                      category: Optional[str], importance: str) -> str:
        """Upsert StandardClause record"""

        clause_data = {
            'standardId': standard_id,
            'sectionId': section_id,
            'clauseNumber': clause_number,
            'title': title,
            'content': content,
            'category': category,
            'importance': importance.upper(),
            'updatedAt': datetime.utcnow().isoformat()
        }

        if self.supabase_client:
            try:
                existing = self.supabase_client.table('StandardClause') \
                    .select('id') \
                    .eq('standardId', standard_id) \
                    .eq('clauseNumber', clause_number) \
                    .execute()

                if existing.data:
                    clause_id = existing.data[0]['id']
                    self.supabase_client.table('StandardClause') \
                        .update(clause_data) \
                        .eq('id', clause_id) \
                        .execute()
                else:
                    clause_id = str(uuid4())
                    clause_data['id'] = clause_id
                    clause_data['createdAt'] = datetime.utcnow().isoformat()

                    self.supabase_client.table('StandardClause') \
                        .insert(clause_data) \
                        .execute()

                return clause_id

            except Exception as e:
                logger.error(f"Clause upsert failed: {e}")
                raise

        elif self.db_connection:
            cursor = self.db_connection.cursor()
            try:
                cursor.execute('''
                    SELECT id FROM "StandardClause"
                    WHERE "standardId" = %s AND "clauseNumber" = %s
                ''', (standard_id, clause_number))
                existing = cursor.fetchone()

                if existing:
                    clause_id = existing[0]
                    cursor.execute('''
                        UPDATE "StandardClause"
                        SET "sectionId" = %s, title = %s, content = %s,
                            category = %s, importance = %s, "updatedAt" = %s
                        WHERE id = %s
                    ''', (section_id, title, content, category,
                          importance, datetime.utcnow(), clause_id))
                else:
                    clause_id = str(uuid4())
                    cursor.execute('''
                        INSERT INTO "StandardClause"
                        (id, "standardId", "sectionId", "clauseNumber", title, content,
                         category, importance, "createdAt", "updatedAt")
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ''', (clause_id, standard_id, section_id, clause_number, title,
                          content, category, importance, datetime.utcnow(), datetime.utcnow()))

                self.db_connection.commit()
                return clause_id

            except Exception as e:
                self.db_connection.rollback()
                raise
            finally:
                cursor.close()

    def _record_sync_history(self, sync_id: str, sync_type: str, status: str,
                            drive_file_id: str, drive_file_name: str,
                            stats: Dict, duration: int):
        """Record sync operation in SyncHistory table"""

        history_data = {
            'id': sync_id,
            'syncType': sync_type,
            'status': status,
            'driveFileId': drive_file_id,
            'driveFileName': drive_file_name,
            'standardsCreated': stats.get('standards_created', 0),
            'standardsUpdated': stats.get('standards_updated', 0),
            'clausesCreated': stats.get('clauses_created', 0),
            'clausesUpdated': stats.get('clauses_updated', 0),
            'errors': stats.get('errors', 0),
            'errorLog': '\n'.join(stats.get('error_messages', [])) if stats.get('error_messages') else None,
            'duration': duration,
            'completedAt': datetime.utcnow().isoformat()
        }

        if self.supabase_client:
            try:
                self.supabase_client.table('SyncHistory') \
                    .insert(history_data) \
                    .execute()
            except Exception as e:
                logger.error(f"Failed to record sync history: {e}")

        elif self.db_connection:
            cursor = self.db_connection.cursor()
            try:
                cursor.execute('''
                    INSERT INTO "SyncHistory"
                    (id, "syncType", status, "driveFileId", "driveFileName",
                     "standardsCreated", "standardsUpdated", "clausesCreated",
                     "clausesUpdated", errors, "errorLog", duration, "completedAt")
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''', (sync_id, sync_type, status, drive_file_id, drive_file_name,
                      stats.get('standards_created', 0), stats.get('standards_updated', 0),
                      stats.get('clauses_created', 0), stats.get('clauses_updated', 0),
                      stats.get('errors', 0), history_data['errorLog'],
                      duration, datetime.utcnow()))

                self.db_connection.commit()
            except Exception as e:
                self.db_connection.rollback()
                logger.error(f"Failed to record sync history: {e}")
            finally:
                cursor.close()

    def _extract_standard_code(self, file_name: str) -> Optional[str]:
        """Extract standard code from file name (e.g., S500, S520)"""
        import re

        # Look for patterns like S500, S520, etc.
        match = re.search(r'S\d{3,4}', file_name, re.IGNORECASE)
        if match:
            return match.group(0).upper()

        return None

    def _extract_title(self, parsed_data: Dict, file_name: str) -> str:
        """Extract or infer title from parsed data"""
        # Try to get from metadata
        metadata = parsed_data.get('metadata', {})

        # Look in sections for a title
        sections = parsed_data.get('sections', [])
        if sections and sections[0].get('title'):
            return sections[0]['title']

        # Fallback to file name
        return file_name.replace('.pdf', '').replace('.docx', '').replace('_', ' ')

    def close(self):
        """Close database connections"""
        if self.db_connection:
            self.db_connection.close()


# Utility function for external use
def sync_parsed_document(parsed_data: Dict, drive_file_id: str,
                         drive_file_name: str) -> Dict:
    """
    Sync a parsed document to Supabase

    Args:
        parsed_data: Parsed document structure
        drive_file_id: Google Drive file ID
        drive_file_name: File name

    Returns:
        Sync statistics dictionary
    """
    service = SupabaseSyncService()
    try:
        return service.sync_standard(parsed_data, drive_file_id, drive_file_name)
    finally:
        service.close()
