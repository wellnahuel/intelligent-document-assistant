import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocumentDetail } from "@/components/documents/DocumentDetail";
import { getDocumentWithPages } from "@/lib/documents/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Documento",
};

type DocumentPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { id } = await params;
  const document = await getDocumentWithPages(id);

  if (!document) {
    notFound();
  }

  return <DocumentDetail document={document} />;
}
