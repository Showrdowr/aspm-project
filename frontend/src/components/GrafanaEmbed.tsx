import React from 'react';

interface GrafanaEmbedProps {
  height?: number;
  dashboardUrl?: string;
}

export default function GrafanaEmbed({ 
  height = 500, 
  dashboardUrl = 'http://localhost:3001/d/k6-dashboard' 
}: GrafanaEmbedProps) {
  return (
    <div className="bg-gray-800 rounded-2xl overflow-hidden border border-gray-700">
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
          📊 Grafana Live Dashboard
        </h3>
        <p className="text-sm text-gray-400 mt-1">
          Real-time metrics from k6 + InfluxDB
        </p>
      </div>
      <iframe
        src={`${dashboardUrl}?kiosk&theme=dark&refresh=5s`}
        width="100%"
        height={height}
        title="Grafana Dashboard"
        className="border-0"
        allow="fullscreen"
      />
    </div>
  );
}
