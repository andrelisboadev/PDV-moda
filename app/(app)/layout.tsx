import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { Navegacao, type ItemNav } from "@/components/navegacao";
import { obterContexto } from "@/lib/core/deps";
import { ErroApp } from "@/lib/core/erros";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  let ctx;
  try {
    ctx = await obterContexto();
  } catch (e) {
    // Sem sessão ou sem acesso ativo: volta para o login. (Outros erros sobem para a página de erro.)
    if (e instanceof ErroApp && (e.codigo === "nao_autenticado" || e.codigo === "proibido")) {
      redirect("/login?error=1");
    }
    throw e;
  }

  // A tela só ESCONDE o que não cabe ao perfil. Quem barra de verdade é o servidor, em cada ação.
  const itens: ItemNav[] = [{ href: "/", rotulo: "Início" }];
  if (ctx.pode("venda.criar")) itens.push({ href: "/vender", rotulo: "Vender" });
  if (ctx.pode("condicional.gerir")) itens.push({ href: "/condicional", rotulo: "Condicional" });
  if (ctx.pode("troca.registrar")) itens.push({ href: "/trocas", rotulo: "Trocas" });
  if (ctx.pode("estoque.ver")) itens.push({ href: "/estoque", rotulo: "Estoque" });
  if (ctx.pode("comissao.propria")) itens.push({ href: "/comissao", rotulo: "Comissão" });
  if (ctx.pode("caixa.ver")) itens.push({ href: "/caixa", rotulo: "Caixa" });
  if (ctx.pode("config.editar")) itens.push({ href: "/configuracoes", rotulo: "Configurações" });

  return (
    <div className="md:pl-56">
      <Navegacao itens={itens} />
      <header className="flex items-center justify-between gap-3 border-b border-borda bg-superficie px-4 py-3">
        <p className="text-sm text-suave">
          Olá, <span className="font-semibold text-texto">{ctx.usuario.nome}</span>
        </p>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="min-h-botao rounded-xl px-4 text-sm font-medium text-primaria">
            Sair
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-6 md:pb-10">{children}</main>
    </div>
  );
}
