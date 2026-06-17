import { Dashboard } from "@/components/dashboard/Dashboard";

type HomePageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const symbol = Array.isArray(params.symbol) ? params.symbol[0] : params.symbol;
  const timeframe = Array.isArray(params.timeframe) ? params.timeframe[0] : params.timeframe;
  const asOf = Array.isArray(params.asOf) ? params.asOf[0] : params.asOf;

  return <Dashboard initialSymbol={symbol ?? ""} initialTimeframe={timeframe ?? ""} initialAsOf={asOf ?? ""} />;
}
