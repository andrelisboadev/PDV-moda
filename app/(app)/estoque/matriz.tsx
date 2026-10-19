import { compararTamanhos, type ProdutoCatalogo } from "@/lib/moda/estoque";

/** Matriz tamanho × cor com o saldo de cada combinação. Verde/âmbar/vermelho só para situação. */
export function MatrizEstoque({ produto }: { produto: ProdutoCatalogo }) {
  const tamanhos = [...new Set(produto.variacoes.map((v) => v.tamanho))].sort(compararTamanhos);
  const cores = [...new Set(produto.variacoes.map((v) => v.cor))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const celula = new Map(produto.variacoes.map((v) => [`${v.tamanho}|${v.cor}`, v]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Estoque de {produto.nome} por tamanho e cor</caption>
        <thead>
          <tr>
            <th scope="col" className="p-2 text-left text-suave">Tam.</th>
            {cores.map((c) => (
              <th key={c} scope="col" className="p-2 text-center font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tamanhos.map((t) => (
            <tr key={t} className="border-t border-borda">
              <th scope="row" className="p-2 text-left font-medium">{t}</th>
              {cores.map((c) => {
                const v = celula.get(`${t}|${c}`);
                if (!v) return <td key={c} className="p-2 text-center text-suave">–</td>;
                const situacao = v.saldo <= 0 ? "text-atraso" : v.minimo > 0 && v.saldo < v.minimo ? "text-atencao" : "text-ok";
                return (
                  <td key={c} className={`p-2 text-center font-valor ${situacao}`}>
                    {v.saldo}
                    <span className="sr-only">
                      {v.saldo <= 0 ? ", sem estoque" : v.minimo > 0 && v.saldo < v.minimo ? ", abaixo do mínimo" : ", em dia"}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
