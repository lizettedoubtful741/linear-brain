import { useEffect, useState } from "react";
import { Card, Button, Typography, Flex, Spin, App, Empty, Collapse, Tag } from "antd";
import { ExperimentOutlined, HistoryOutlined } from "@ant-design/icons";
import type { Insight } from "../types";
import { fetchInsights, generateInsight } from "../api";

const { Text, Title } = Typography;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function InsightContent({ content }: { content: string }) {
  // Render markdown-ish content as structured HTML
  // Split by headings and render sections
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.startsWith("### ")) {
      elements.push(
        <Title key={key++} level={5} style={{ marginTop: 24, marginBottom: 8, color: "#a78bfa", letterSpacing: "-0.01em" }}>
          {line.slice(4)}
        </Title>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <Title key={key++} level={4} style={{ marginTop: 28, marginBottom: 12, letterSpacing: "-0.02em" }}>
          {line.slice(3)}
        </Title>
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <Title key={key++} level={3} style={{ marginTop: 28, marginBottom: 12, letterSpacing: "-0.025em" }}>
          {line.slice(2)}
        </Title>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={key++} style={{ paddingLeft: 16, marginBottom: 4 }}>
          <Text>• {line.slice(2)}</Text>
        </div>
      );
    } else if (line.startsWith("  - ") || line.startsWith("  * ")) {
      elements.push(
        <div key={key++} style={{ paddingLeft: 32, marginBottom: 4 }}>
          <Text type="secondary">◦ {line.slice(4)}</Text>
        </div>
      );
    } else if (line.match(/^\d+\. /)) {
      elements.push(
        <div key={key++} style={{ paddingLeft: 16, marginBottom: 4 }}>
          <Text>{line}</Text>
        </div>
      );
    } else if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(
        <Text key={key++} strong style={{ display: "block", marginTop: 12, marginBottom: 4 }}>
          {line.replace(/\*\*/g, "")}
        </Text>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key++} style={{ height: 8 }} />);
    } else {
      // Inline bold rendering
      const parts = line.split(/(\*\*.*?\*\*)/g);
      elements.push(
        <Text key={key++} style={{ display: "block", marginBottom: 2, lineHeight: 1.7 }}>
          {parts.map((part, j) =>
            part.startsWith("**") && part.endsWith("**")
              ? <Text key={j} strong>{part.slice(2, -2)}</Text>
              : part
          )}
        </Text>
      );
    }
  }

  return <div>{elements}</div>;
}

export default function Insights() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const { message, notification } = App.useApp();

  const load = async () => {
    try {
      setInsights(await fetchInsights());
    } catch (err) {
      message.error(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateInsight();
      notification.success({
        message: "Insight generated",
        description: "Fresh board analysis is ready.",
      });
      await load();
    } catch (err) {
      notification.error({
        message: "Insight generation failed",
        description: String(err),
      });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <Spin style={{ display: "block", margin: "80px auto" }} size="large" />;

  const latest = insights[0] ?? null;
  const previous = insights.slice(1);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0, letterSpacing: "-0.025em" }}>Insights</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            AI-powered board analysis for leads
          </Text>
        </div>
        <Button
          type="primary"
          icon={<ExperimentOutlined />}
          loading={generating}
          onClick={handleGenerate}
        >
          {generating ? "Analysing..." : "Generate Insight"}
        </Button>
      </Flex>

      {/* Latest insight */}
      {latest ? (
        <Card bordered style={{ marginBottom: 24 }}>
          <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
            <Flex align="center" gap={10}>
              <Tag bordered={false} color="purple">Latest</Tag>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {formatDate(latest.created_at)} · {timeAgo(latest.created_at)}
              </Text>
            </Flex>
            <Text type="secondary" style={{ fontSize: 12 }}>{latest.issue_count} issues analysed</Text>
          </Flex>
          <InsightContent content={latest.content} />
        </Card>
      ) : (
        <Card bordered style={{ marginBottom: 24 }}>
          <Empty
            image={<ExperimentOutlined style={{ fontSize: 48, color: "#71717a" }} />}
            description={<Text type="secondary">No insights yet. Generate your first one.</Text>}
          />
        </Card>
      )}

      {/* Previous insights */}
      {previous.length > 0 && (
        <Collapse
          ghost
          items={previous.map((insight) => ({
            key: insight.id,
            label: (
              <Flex justify="space-between" align="center" style={{ width: "100%" }}>
                <Flex align="center" gap={8}>
                  <HistoryOutlined />
                  <Text type="secondary">{formatDate(insight.created_at)}</Text>
                </Flex>
                <Text type="secondary" style={{ fontSize: 12 }}>{insight.issue_count} issues</Text>
              </Flex>
            ),
            children: (
              <Card bordered size="small">
                <InsightContent content={insight.content} />
              </Card>
            ),
          }))}
        />
      )}
    </div>
  );
}
