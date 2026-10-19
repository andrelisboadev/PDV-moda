import { signIn } from "@/auth";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="font-titulo text-3xl font-bold text-primaria">Balcão Moda</h1>
      <p className="text-suave">Entre com a conta Google que a sua loja cadastrou.</p>
      {error && (
        <p role="alert" className="rounded-xl border border-atraso/40 bg-atraso/10 p-3 text-sm text-atraso">
          Não foi possível entrar. Confira se você usou o e-mail cadastrado pela loja ou fale com a dona ou o dono.
        </p>
      )}
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button type="submit" className="botao w-full">
          Entrar com Google
        </button>
      </form>
    </main>
  );
}
