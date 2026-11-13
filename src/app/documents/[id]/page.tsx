import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocumentDetail } from "@/components/documents/DocumentDetail";
import { getChunkingConfig } from "@/lib/chunking/config";
import { requireUser } from "@/lib/dal";
import { toDocumentDetailDto } from "@/lib/documents/dto";
import { getDocumentDetailForUser } from "@/lib/documents/queries";
import { getDocumentEmbeddingSummary } from "@/lib/embeddings/summary";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Documento",
};

type DocumentPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DocumentPage({ params }: DocumentPageProps) {
  const user = await requireUser();
  const { id } = await params;
  const document = await getDocumentDetailForUser(user.id, id);

  if (!document) {
    notFound();
  }

  const embeddingSummary = await getDocumentEmbeddingSummary(user.id, id);

  return (
    <DocumentDetail
      document={toDocumentDetailDto(document)}
      chunking={getChunkingConfig()}
      embeddingSummary={embeddingSummary}
    />
  );
}
