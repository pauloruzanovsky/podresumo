import { supabase } from "@/lib/supabase";
import LessonsList from "@/components/LessonsList";

export const revalidate = 60;

export const metadata = {
  title: "Lessons Learned — PodResumo",
  description: "Insights e ações práticas extraídos de cada episódio.",
};

export default async function LessonsPage() {
  const { data: episodes, error } = await supabase
    .from("episodes")
    .select("id, titulo, main_insight, main_action, data, podcasts(nome)")
    .eq("status", "done")
    .order("data", { ascending: false });

  if (error) {
    return <p className="text-red-400">Erro ao carregar: {error.message}</p>;
  }

  const lessons = (episodes ?? [])
    .filter((ep: any) => ep.main_insight || ep.main_action)
    .map((ep: any) => ({
      id: ep.id,
      titulo: ep.titulo,
      main_insight: ep.main_insight,
      main_action: ep.main_action,
      data: ep.data,
      podcast_nome: ep.podcasts?.nome ?? "",
    }));

  return (
    <div>
      {/* Header */}
      <div className="text-center mb-14">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-light animate-pulse" />
          <span className="text-xs font-medium text-accent-light">
            {lessons.length} lessons
          </span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 leading-[1.1]">
          Lessons
          <br />
          <span className="text-accent">Learned.</span>
        </h1>
        <p className="text-muted">
          O principal insight e a ação prática de cada episódio — tudo num só lugar.
        </p>
      </div>

      <LessonsList lessons={lessons} />
    </div>
  );
}
