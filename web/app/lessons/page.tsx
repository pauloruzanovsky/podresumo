import { supabase } from "@/lib/supabase";
import { podcastVisivel } from "@/lib/podcasts";
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
    return <p className="text-red-600">Erro ao carregar: {error.message}</p>;
  }

  const lessons = (episodes ?? [])
    .filter((ep: any) => podcastVisivel(ep.podcasts?.nome))
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
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card border border-border mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-muted/50" />
          <span className="text-xs font-medium text-muted">
            {lessons.length} lessons
          </span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 leading-[1.1]">
          Lessons
          <br />
          <span className="text-muted">Learned.</span>
        </h1>
        <p className="text-muted">
          O principal insight e a ação prática de cada episódio — tudo num só lugar.
        </p>
      </div>

      <LessonsList lessons={lessons} />
    </div>
  );
}
