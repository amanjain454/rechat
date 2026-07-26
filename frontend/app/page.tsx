"use client";

import { useState } from "react";

export default function Home() {
  const [backendStatus, setBackendStatus] = useState("Not checked");

  async function checkBackend() {
    setBackendStatus("Checking...");

    try {
      const response = await fetch("http://127.0.0.1:8000/health");

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const data: { status: string } = await response.json();
      setBackendStatus(data.status);
    } catch (error) {
      console.error(error);
      setBackendStatus("Connection failed");
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold">RecChat</h1>

      <p className="text-lg">
        Talk with source-grounded simulations of historical personalities.
      </p>

      <button
        onClick={checkBackend}
        className="rounded-md bg-black px-4 py-2 text-white"
      >
        Check backend
      </button>

      <p>
        Backend status: <strong>{backendStatus}</strong>
      </p>
    </main>
  );
}