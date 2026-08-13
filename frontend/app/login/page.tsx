import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";

export const metadata = { title: "Log in — Dwellio" };

/**
 * Server component: it only reads ?next= off the URL and hands it to the
 * client form. Keeping the page itself on the server means the shell, heading
 * and demo panel ship as plain HTML.
 */
export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = typeof params.next === "string" ? params.next : "/";

  return (
    <AuthShell
      title="Welcome back."
      subtitle="Sign in to see your trips, your saved homes, and anything you're hosting."
    >
      <AuthForm mode="login" next={next} />
    </AuthShell>
  );
}
