import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

const MOCK_USER_ID = 'cfee0e9c-e773-46ca-a305-0023b9a070b4';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = MOCK_USER_ID;
    const resolvedParams = await params;
    const id = resolvedParams.id;

    const record = await prisma.governanceRecord.findUnique({
      where: { id }
    });

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Save to public/uploads
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
    const filePath = path.join(uploadDir, fileName);
    
    fs.writeFileSync(filePath, buffer);

    // Create DB Evidence
    const evidence = await prisma.governanceEvidence.create({
      data: {
        governanceRecordId: id,
        fileName: file.name,
        fileType: file.type,
        filePath: `/uploads/${fileName}`,
        uploaderId: userId,
      }
    });

    // Update hasEvidence flag
    await prisma.governanceRecord.update({
      where: { id },
      data: { hasEvidence: true }
    });

    return NextResponse.json(evidence, { status: 201 });
  } catch (error) {
    console.error('Error uploading evidence:', error);
    return NextResponse.json({ error: 'Failed to upload evidence' }, { status: 500 });
  }
}
