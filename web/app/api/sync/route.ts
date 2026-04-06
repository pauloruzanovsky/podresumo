import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { playlist_id, podcast_id, max_results = 3 } = body;

  if (!playlist_id || !podcast_id) {
    return NextResponse.json(
      { error: "playlist_id e podcast_id são obrigatórios" },
      { status: 400 }
    );
  }

  const pipelinePath = path.resolve(process.cwd(), "..", "pipeline");
  const pythonPath = path.join(pipelinePath, ".venv", "Scripts", "python");

  const command = `cd "${pipelinePath}" && "${pythonPath}" -m flows.sync_podcast_cli --playlist-id "${playlist_id}" --podcast-id "${podcast_id}" --max-results ${max_results}`;

  return new Promise<NextResponse>((resolve) => {
    exec(command, { timeout: 300000 }, (error, stdout, stderr) => {
      if (error) {
        console.error("Pipeline error:", stderr);
        resolve(
          NextResponse.json(
            { error: "Erro no pipeline", details: stderr || error.message },
            { status: 500 }
          )
        );
        return;
      }

      resolve(
        NextResponse.json({
          success: true,
          output: stdout || stderr || "Pipeline executado com sucesso.",
        })
      );
    });
  });
}
