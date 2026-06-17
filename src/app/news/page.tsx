import { NewsDashboard } from "@/components/news/NewsDashboard";

type NewsPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function NewsPage({ searchParams }: NewsPageProps) {
  const params = await searchParams;
  const ticker = Array.isArray(params.ticker) ? params.ticker[0] : params.ticker;
  const query = Array.isArray(params.query) ? params.query[0] : params.query;
  const queryMode = Array.isArray(params.queryMode) ? params.queryMode[0] : params.queryMode;
  const timeframe = Array.isArray(params.timeframe) ? params.timeframe[0] : params.timeframe;
  const days = Array.isArray(params.days) ? params.days[0] : params.days;
  const sentiment = Array.isArray(params.sentiment) ? params.sentiment[0] : params.sentiment;
  const sourceId = Array.isArray(params.sourceId) ? params.sourceId[0] : params.sourceId;
  const minRelevance = Array.isArray(params.minRelevance) ? params.minRelevance[0] : params.minRelevance;

  return (
    <NewsDashboard
      key={`${ticker ?? ""}-${query ?? ""}-${queryMode ?? ""}-${timeframe ?? ""}-${days ?? ""}-${sentiment ?? ""}-${sourceId ?? ""}-${minRelevance ?? ""}`}
      initialTicker={ticker ?? ""}
      initialQuery={query ?? ""}
      initialQueryMode={queryMode ?? ""}
      initialTimeframe={timeframe ?? ""}
      initialDays={days ?? ""}
      initialSentiment={sentiment ?? ""}
      initialSourceId={sourceId ?? ""}
      initialMinRelevance={minRelevance ?? ""}
    />
  );
}
