import { notFound } from "next/navigation";
import { DrawerPreview } from "@/components/drawer/drawer-preview";

export default function FilingDrawerPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DrawerPreview />;
}
