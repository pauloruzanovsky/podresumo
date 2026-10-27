/**
 * Categorias da estante.
 *
 * `livros.temas` vem da extração em texto livre: são 1.260 temas diferentes
 * pra ~730 livros ("Desenvolvimento Pessoal" e "Desenvolvimento pessoal",
 * "Investimentos" e "Educação financeira"…). Filtrar por eles cobria só uma
 * fatia da estante. Aqui cada tema cai em uma ou mais categorias fixas, por
 * palavra-chave; um livro entra em todas as categorias dos seus temas.
 *
 * As regras olham o tema sem acento e em minúsculas. Tema que não casa com
 * nada simplesmente não gera categoria.
 */

const REGRAS: [categoria: string, padrao: RegExp][] = [
  [
    "Investimentos e Dinheiro",
    /invest|financ|dinheiro|moeda|bitcoin|cripto|\bacoes|dividend|riqueza|enriquec|prosperidade|poupanc|divida|inflac|especulac|monetari|fiduciari|analise de empresas|mercado de capitais|renda/,
  ],
  [
    "Negócios e Carreira",
    /empreend|negocio|startup|empresa|gestao|administrac|lideranc|marketing|venda|comercia|copywriting|branding|\bmarca\b|posicionamento|publicidade|varejo|inovac|organizac|negociac|carreira|trabalho|consumidor|mentoria|amazon/,
  ],
  [
    "Desenvolvimento Pessoal",
    /desenvolvimento pessoal|autodesenvolv|autoconhec|autoajuda|habito|disciplina|produtividade|performance|mentalidade|motivac|superac|sucesso|foco|gestao do tempo|prioriz|resilien|proposito|felicidade|coragem|ambic|adversidade|vulnerabil|autoaceit|perfeccion|leitura|metodo de estudo/,
  ],
  [
    "Psicologia e Comportamento",
    /psicolog|comportament|vies|vieses|neurocien|tomada de decis|saude mental|bem-estar mental|emoc|dopamina|irracional|inteligencia emocional|natureza humana|atencao|^memoria$|psiquiatr|psicanal|inconsciente|transtorno|psicometr|\bmentes?\b/,
  ],
  [
    "Comunicação e Persuasão",
    /comunicac|oratoria|retorica|persuas|influencia|gatilho|argumentac|storytelling|escrita|linguagem corporal|narrativa|neuromarketing/,
  ],
  [
    "Filosofia",
    /filosof|etica|moral|metafisic|estoic|existencial|niilis|virtude|sabedoria|sentido da vida|logica|epistemolog|absurdo|nietzsche|eterno retorno|verdade|consciencia|humanismo|objetivismo|socratic/,
  ],
  [
    "Religião e Espiritualidade",
    /religi|espiritual|cristian|teolog|biblia|^fe$|fe e razao|apologet|devocional|deus|alma|igreja|catolic|budis|esoter|hermet/,
  ],
  [
    "História",
    /histori|guerra|civiliza|imperio|holocausto|revoluc|coloniza|antig|militar|descobrimento|medieval|inconfidencia/,
  ],
  [
    "Política e Economia",
    /politic|economi|geopolit|estado|governo|democrac|liberal|libertari|capitalis|socialis|comunis|totalitar|autoritar|ideolog|relacoes internacionais|ordem global|brics|potencias|poder|justica|direito|^lei$|legisla|republica|monarquia|desigualdade|pobreza|planejamento central|intervenc|escola austriaca|propriedade privada|coletivis|individualis|sociolog|pos-modern|cultura\b|consumismo|violencia|soberania|governanca/,
  ],
  [
    "Ciência e Tecnologia",
    /tecnolog|inteligencia artificial|ciencia|cientific|fisica|biologia|evoluc|genetic|astronom|cosmolog|matematic|estatistic|probabil|internet|digital|metaverso|futur|exponencial|vale do silicio|risco existencial|extraterrestre|aprendizado de maquina|computac|quantic|biodivers|linguagem natural/,
  ],
  [
    "Saúde e Longevidade",
    /saude|longevid|nutric|sono|exercicio|fitness|esporte|emagrec|metabol|envelhec|otimizacao biologica|medicin|imortal|bem-estar|qualidade de vida|circadian/,
  ],
  [
    "Literatura e Ficção",
    /literatura|ficcao|romance|fantasia|poesia|epico|tragedia|mitolog|suspense|terror|misterio|aventura|distopia|vampir|satira|\bcontos?\b|classico|policial|melancolia/,
  ],
  [
    "Relacionamentos e Família",
    /relacionament|amor|casamento|famil|parentalidade|paternidade|maternidade|infancia|sexualidade|seducao|masculinidade|feminis|genero|casal/,
  ],
  ["Biografias", /biograf|memorias|autobiograf/],
];

function normaliza(tema: string) {
  return tema.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** Categorias de um livro, a partir dos temas soltos da extração. */
export function categoriasDe(temas: string[]): string[] {
  const achadas = new Set<string>();
  for (const tema of temas) {
    const t = normaliza(tema);
    for (const [categoria, padrao] of REGRAS) {
      if (padrao.test(t)) achadas.add(categoria);
    }
  }
  return [...achadas];
}
