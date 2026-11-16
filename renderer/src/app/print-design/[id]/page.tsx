import PrintDesigner from "@/components/PrintDesigner";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PrintDesigner id={Number(id)} />;
}
