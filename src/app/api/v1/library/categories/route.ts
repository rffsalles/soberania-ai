import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAllCorpusChunks } from '@/domains/rag';

const createCategorySchema = z.object({
  name: z.string().min(2, 'Nome da categoria deve ter pelo menos 2 caracteres'),
  description: z.string().optional(),
  color: z.string().optional().default('teal'),
});

const DEFAULT_CATEGORIES = [
  {
    name: 'Engenharia de Software',
    description: 'Arquitetura, design patterns e ciclo de vida de sistemas',
    color: 'teal',
  },
  {
    name: 'Banco de Dados',
    description: 'Modelagem relacional, SQL, NoSQL e indexação',
    color: 'blue',
  },
  {
    name: 'Algoritmos & Estrutura de Dados',
    description: 'Complexidade, grafos, ordenação e árvores',
    color: 'emerald',
  },
  {
    name: 'Inteligência Artificial & RAG',
    description: 'LLMs, SLMs on-premises, embeddings e busca vetorial',
    color: 'indigo',
  },
  {
    name: 'Direito Constitucional',
    description: 'Normas fundamentais, direitos e garantias',
    color: 'amber',
  },
  {
    name: 'Gestão & Inovação',
    description: 'Liderança, metodologias ágeis e governança corporativa',
    color: 'cyan',
  },
  {
    name: 'Metodologia Científica',
    description: 'Pesquisa acadêmica, escrita científica e normas ABNT',
    color: 'slate',
  },
];

export async function GET() {
  try {
    let categories = await db.documentCategory.findMany({
      orderBy: { name: 'asc' },
    });

    // Auto-seed canonical categories if database is empty
    if (categories.length === 0) {
      await db.documentCategory.createMany({
        data: DEFAULT_CATEGORIES,
        skipDuplicates: true,
      });
      categories = await db.documentCategory.findMany({
        orderBy: { name: 'asc' },
      });
    }

    // Cross-reference document and chunk counts from RAG corpus
    const allChunks = getAllCorpusChunks();
    const statsMap = new Map<string, { chunks: number; docIds: Set<string> }>();

    for (const chunk of allChunks) {
      const catName = chunk.category || 'Geral';
      if (!statsMap.has(catName.toLowerCase())) {
        statsMap.set(catName.toLowerCase(), { chunks: 0, docIds: new Set<string>() });
      }
      const stat = statsMap.get(catName.toLowerCase())!;
      stat.chunks += 1;
      stat.docIds.add(chunk.materialId);
    }

    const categoriesWithStats = categories.map((cat) => {
      const stat = statsMap.get(cat.name.toLowerCase());
      return {
        id: cat.id,
        name: cat.name,
        description: cat.description,
        color: cat.color,
        documentCount: stat ? stat.docIds.size : 0,
        chunkCount: stat ? stat.chunks : 0,
        createdAt: cat.createdAt,
      };
    });

    return NextResponse.json({
      success: true,
      categories: categoriesWithStats,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao listar categorias';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = createCategorySchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message || 'Dados inválidos para categoria',
        },
        { status: 400 }
      );
    }

    const { name, description, color } = parsed.data;

    const existing = await db.documentCategory.findFirst({
      where: {
        name: { equals: name.trim(), mode: 'insensitive' },
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          success: true,
          category: existing,
          message: 'Categoria já existente recuperada com sucesso.',
        },
        { status: 200 }
      );
    }

    const category = await db.documentCategory.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        color: color || 'teal',
      },
    });

    return NextResponse.json(
      {
        success: true,
        category,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao cadastrar categoria';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
