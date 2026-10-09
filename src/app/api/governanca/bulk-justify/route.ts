import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const idsString = formData.get('ids') as string;
    const justification = formData.get('justification') as string;
    const notes = (formData.get('notes') as string) || null;
    const file = formData.get('file') as File | null;

    if (!idsString || !justification) {
      return NextResponse.json({ error: 'IDs e Justificativa são obrigatórios' }, { status: 400 });
    }

    const ids: string[] = JSON.parse(idsString);
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Nenhum item selecionado' }, { status: 400 });
    }

    let user = await prisma.user.findFirst();
    const userId = user?.id || 'cfee0e9c-e773-46ca-a305-0023b9a070b4';

    let fileInfo: { fileName: string; fileType: string; filePath: string } | null = null;

    if (file && file.size > 0) {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'evidences');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const uniqueFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const filePath = path.join(uploadDir, uniqueFileName);
      fs.writeFileSync(filePath, buffer);

      fileInfo = {
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        filePath: `/uploads/evidences/${uniqueFileName}`,
      };
    }

    // Update each governance record
    await prisma.governanceRecord.updateMany({
      where: { id: { in: ids } },
      data: {
        justification,
        justificationStatus: 'JUSTIFICADO',
        justificationDate: new Date(),
        justifierUserId: userId,
        hasEvidence: !!fileInfo,
        notes: notes || undefined,
      },
    });

    // If file uploaded, attach evidence to each record
    if (fileInfo) {
      const evidencesData = ids.map((recordId) => ({
        governanceRecordId: recordId,
        fileName: fileInfo!.fileName,
        fileType: fileInfo!.fileType,
        filePath: fileInfo!.filePath,
        uploaderId: userId,
      }));

      await prisma.governanceEvidence.createMany({
        data: evidencesData,
      });
    }

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error: any) {
    console.error('Error in bulk justify:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
