import SurveyClient from "./SurveyClient";

interface PageProps {
  searchParams: Promise<{ id?: string }>;
}

export const metadata = {
  title: "고객 만족도 조사 | Aqara",
  description: "아카라 스마트 도어락 고객 만족도 조사",
};

export default async function SatisfactionSurveyPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const id = resolvedSearchParams.id ?? "";
  return <SurveyClient registrationId={id} />;
}
