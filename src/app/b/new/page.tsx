import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { PageFrame, PageHeader } from "@/components/PageFrame";
import { CreateSpaceForm } from "@/components/spaces/CreateSpaceForm";
import { getCurrentUser } from "@/lib/auth";
import { routes } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Create Space — Borynx",
  description: "Launch a specialized community for practitioners in your tech vertical.",
};

export default async function NewSpacePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`${routes.login()}?next=/b/new`);
  }

  return (
    <PageFrame
      stream
      header={
        <PageHeader
          eyebrow="Community Builder"
          title="Launch a niche space"
          description="Create a dedicated working room for practitioners in your engineering, design, or infrastructure specialty."
        />
      }
    >
      <div className="max-w-2xl mx-auto">
        <CreateSpaceForm />
      </div>
    </PageFrame>
  );
}
