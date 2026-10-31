export function Avisos({ ok, erro, mensagens }: { ok?: string; erro?: string; mensagens: Record<string, string> }) {
  return (
    <>
      {ok && <p role="status" className="rounded-xl border border-ok/40 bg-ok/10 p-3 text-sm text-ok">{mensagens[ok] ?? "Feito."}</p>}
      {erro && <p role="alert" className="rounded-xl border border-atraso/40 bg-atraso/10 p-3 text-sm text-atraso">{mensagens[erro] ?? "Não foi possível concluir. Tente de novo."}</p>}
    </>
  );
}
