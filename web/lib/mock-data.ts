export interface Book {
    titulo: string;
    autor: string;
}

export interface Episode {
  id: string;
  podcast_id: string;
  titulo: string;
  data: string;
  duracao: string;
  thumbnail: string;
  convidados: string[];
  tags: string[];
  resumo: string;
  main_insight: string;
  main_action: string;
  topicos: string[];
  livros: Book[];
  link_youtube: string;
  status: string;
}

export interface Podcast {
  id: string;
  nome: string;
  youtube_channel_id: string;
  thumbnail: string;
}

export const MOCK_PODCASTS: Podcast[] = [
  {
    id: "os-socios",
    nome: "Os Sócios Podcast",
    youtube_channel_id: "@OsSociosPodcast",
    thumbnail: "",
  },
];

export const MOCK_EPISODES: Episode[] = [
  {
    id: "ep282",
    podcast_id: "os-socios",
    titulo: "LUCIANO HANG: A HISTÓRIA POR TRÁS DA HAVAN",
    data: "2025-02-05",
    duracao: "2h15min",
    thumbnail: "",
    convidados: ["Luciano Hang"],
    tags: ["Empreendedorismo", "Varejo", "Gestão"],
    resumo:
      "Neste episódio, Bruno e Malu recebem Luciano Hang, fundador da Havan, para uma conversa sobre a trajetória de construção de um dos maiores impérios do varejo brasileiro. Hang conta desde a infância simples até as decisões que transformaram uma pequena loja em uma rede nacional com milhares de colaboradores.",
    main_insight:
      "O maior diferencial competitivo de longo prazo não é capital, é a disposição de trabalhar mais do que qualquer concorrente durante décadas sem desviar o foco.",
    main_action:
      "Escolha UMA métrica do seu negócio ou carreira e comprometa-se a melhorá-la 1% toda semana pelos próximos 6 meses, sem pular nenhuma semana.",
    topicos: [
      "A infância de Luciano Hang e o começo na fábrica",
      "A primeira loja e a decisão de expandir",
      "Sobrevivendo à hiperinflação e crises econômicas",
      "Cultura organizacional e gestão de pessoas na Havan",
      "O flerte com o IPO e por que recuou",
      "Concorrência vs. burocracia: o que trava o crescimento",
    ],
    livros: [
      { titulo: "O Poder do Hábito", autor: "Charles Duhigg" },
      { titulo: "De Bom a Ótimo", autor: "Jim Collins" },
      { titulo: "O Lado Difícil das Situações Difíceis", autor: "Ben Horowitz" },
    ],
    link_youtube: "https://youtube.com/@OsSociosPodcast",
    status: "done",
  },
  {
    id: "ep281",
    podcast_id: "os-socios",
    titulo: "ROMEU ZEMA: POLÍTICA, GESTÃO PÚBLICA E O FUTURO DO BRASIL",
    data: "2025-01-29",
    duracao: "1h58min",
    thumbnail: "",
    convidados: ["Romeu Zema"],
    tags: ["Política", "Gestão Pública", "Economia"],
    resumo:
      "O governador de Minas Gerais conta como fez a transição do setor privado para a política e compartilha sua visão sobre gestão pública no Brasil. A conversa aborda transparência, cenário eleitoral, bastidores do governo e o que separa discurso de execução.",
    main_insight:
      "Gestão pública eficiente exige a mesma disciplina financeira do setor privado — gastar menos do que arrecada não é austeridade, é sobrevivência.",
    main_action:
      "Analise suas próprias finanças pessoais como se fosse um orçamento público: identifique 3 gastos recorrentes que não geram retorno e elimine-os este mês.",
    topicos: [
      "Transição do setor privado para a política",
      "Gestão pública vs. gestão privada",
      "Cenário eleitoral e lideranças da direita",
      "Transparência e responsabilidade fiscal",
      "O que não pode continuar sendo normalizado no Brasil",
    ],
    livros: [
      { titulo: "O Príncipe", autor: "Maquiavel" },
      { titulo: "Por Que as Nações Fracassam", autor: "Daron Acemoglu" },
    ],
    link_youtube: "https://youtube.com/@OsSociosPodcast",
    status: "done",
  },
  {
    id: "ep279",
    podcast_id: "os-socios",
    titulo: "COMO DEFINIR E CUMPRIR METAS EM 2025",
    data: "2025-01-15",
    duracao: "2h05min",
    thumbnail: "",
    convidados: ["Renato Cariani", "Marcelo Toledo"],
    tags: ["Desenvolvimento Pessoal", "Metas", "Produtividade"],
    resumo:
      "Renato Cariani e Marcelo Toledo trazem uma conversa prática sobre definição e cumprimento de metas. O episódio aborda desde como escolher metas assertivas até estratégias para não desanimar no meio do caminho.",
    main_insight:
      "Uma meta sem sistema de medição é apenas um desejo. O progresso visível é o combustível da consistência.",
    main_action:
      "Pegue sua meta mais importante para 2025, quebre em 4 marcos trimestrais e coloque um lembrete semanal para revisar o progresso.",
    topicos: [
      "A diferença entre sonho, meta e objetivo",
      "Como definir metas assertivas e mensuráveis",
      "Estratégias para manter consistência",
      "O limiar entre meta audaciosa e inalcançável",
      "A importância de medir progresso",
      "Recompensas e marcos intermediários",
    ],
    livros: [
      { titulo: "O Poder da Ação", autor: "Paulo Vieira" },
      { titulo: "O Poder do Hábito", autor: "Charles Duhigg" },
      { titulo: "O Milagre da Manhã", autor: "Hal Elrod" },
      { titulo: "Mindset", autor: "Carol Dweck" },
    ],
    link_youtube: "https://youtube.com/@OsSociosPodcast",
    status: "done",
  },
  {
    id: "ep225",
    podcast_id: "os-socios",
    titulo: "VALE A PENA INVESTIR EM BITCOIN EM 2025?",
    data: "2025-01-09",
    duracao: "1h57min",
    thumbnail: "",
    convidados: ["Felipe Santana", "Rafael Castaneda"],
    tags: ["Investimentos", "Criptomoedas", "Bitcoin"],
    resumo:
      "Felipe Santana e Rafael Castaneda fazem um panorama completo sobre o mercado cripto em 2025. A conversa cobre a influência política sobre as criptomoedas, riscos regulatórios, autocustódia e estratégias de investimento.",
    main_insight:
      "Bitcoin não é aposta — é uma tese de longo prazo sobre escassez digital. Quem trata como loteria perde; quem trata como reserva de valor acumula.",
    main_action:
      "Se você ainda não tem exposição a cripto, separe 2-5% do seu patrimônio investível, compre Bitcoin e configure uma carteira de autocustódia.",
    topicos: [
      "O ciclo de alta do Bitcoin em 2025",
      "Impacto das eleições americanas nas criptos",
      "Riscos regulatórios e autocustódia",
      "Estratégias de investimento em criptomoedas",
      "Bitcoin como reserva de valor vs. especulação",
      "O futuro do mercado cripto global",
    ],
    livros: [
      { titulo: "O Padrão Bitcoin", autor: "Saifedean Ammous" },
      { titulo: "Criptomoedas", autor: "Chris Burniske" },
      { titulo: "O Investidor Inteligente", autor: "Benjamin Graham" },
    ],
    link_youtube: "https://youtube.com/@OsSociosPodcast",
    status: "done",
  },
  {
    id: "ep238",
    podcast_id: "os-socios",
    titulo: "THIAGO NIGRO: O HOMEM QUE COMPROU O TEMPO",
    data: "2025-04-10",
    duracao: "2h20min",
    thumbnail: "",
    convidados: ["Thiago Nigro"],
    tags: ["Filosofia", "Finanças", "Desenvolvimento Pessoal"],
    resumo:
      "Thiago Nigro (O Primo Rico) apresenta as lições do seu novo livro 'O Homem que Comprou o Tempo'. O episódio aborda a obsessão moderna por acúmulo de bens e como converter tempo em dinheiro de forma inteligente.",
    main_insight:
      "Riqueza real não se mede pelo saldo bancário, mas pela quantidade de tempo livre que você tem para fazer o que importa.",
    main_action:
      "Calcule seu 'salário por hora real' (renda / horas trabalhadas incluindo deslocamento) e avalie se o trade-off tempo x dinheiro está valendo a pena.",
    topicos: [
      "A armadilha do acúmulo sem propósito",
      "Tempo vs. dinheiro: a troca que fazemos todo dia",
      "Liberdade financeira real vs. corrida sem fim",
      "Lições do livro 'O Homem que Comprou o Tempo'",
      "Como direcionar esforços com significado",
    ],
    livros: [
      { titulo: "O Homem que Comprou o Tempo", autor: "Thiago Nigro" },
      { titulo: "Pai Rico, Pai Pobre", autor: "Robert Kiyosaki" },
      { titulo: "Essencialismo", autor: "Greg McKeown" },
    ],
    link_youtube: "https://youtube.com/@OsSociosPodcast",
    status: "done",
  },
];