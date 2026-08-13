import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";

export const metadata = { title: "Create an account — Dwellio" };

export default async function RegisterPage(props: PageProps<"/register">) {
  const params = await props.searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  // The navbar's "Host your place" links here with ?role=host, so the form
  // opens on the choice they already made.
  const defaultRole = params.role === "host" ? "host" : "guest";

  return (
    <AuthShell
      title="Book it, or host it."
      subtitle="One account. Choose whether you're here to stay somewhere or to open your own place up."
    >
      <AuthForm mode="register" next={next} defaultRole={defaultRole} />
    </AuthShell>
  );
}
