import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized - please sign in' },
        { status: 401 }
      );
    }

    // Get user ID from database
    const { data: user, error: userError } = await supabaseAdmin
      .from('User')
      .select('id')
      .eq('email', session.user.email)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // 2. Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
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
    const storagePath = `reports/${user.id}/${fileName}`;

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
        uploaded_by: user.id,
        upload_source: 'dashboard',
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
        mime_type: file.type
      })
    }).catch(err => {
      console.error('Failed to trigger parser:', err);
      // Don't fail the upload request if parser is unavailable
      // Parser can be triggered manually later
    });

    return NextResponse.json({
      success: true,
      upload: reportUpload,
      message: 'File uploaded successfully. Processing started.'
    }, { status: 201 });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
