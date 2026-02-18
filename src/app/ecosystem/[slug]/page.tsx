"use client";

import { useParams } from "next/navigation";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { GlassCard } from "@/components/ui/GlassCard";
import { useApi } from "@/hooks/use-api";
import { GridSkeleton } from "@/components/ui/Skeleton";
import { Package, ExternalLink, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface Product {
  slug: string; name: string; description: string; status: string;
  tech: string[]; links: { label: string; url: string }[];
  metrics?: Record<string, string | number>;
}

export default function EcosystemProductPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { data: product, loading } = useApi<Product>(`/api/ecosystem/${slug}`);

  if (loading) return <PageWrapper><GridSkeleton count={2} /></PageWrapper>;

  if (!product) {
    return (
      <PageWrapper>
        <div className="text-center py-12">
          <p className="text-zinc-400">Product not found</p>
          <Link href="/knowledge?tab=ecosystem" className="text-primary-400 text-xs mt-2 inline-block">Back to ecosystem</Link>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <Link href="/knowledge?tab=ecosystem" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 mb-4 transition-colors">
        <ArrowLeft className="w-3 h-3" /> Back to Ecosystem
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard index={0} className="lg:col-span-2">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Package className="w-7 h-7 text-primary-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-zinc-100">{product.name}</h1>
              <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium uppercase ${
                product.status === "active" ? "bg-accent-green/10 text-accent-green" :
                product.status === "beta" ? "bg-accent-yellow/10 text-accent-yellow" :
                "bg-white/[0.04] text-zinc-500"
              }`}>
                {product.status}
              </span>
            </div>
          </div>
          <p className="text-sm text-zinc-400 mb-4">{product.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {product.tech.map((t) => (
              <span key={t} className="text-[10px] px-2 py-1 rounded-lg bg-white/[0.04] text-zinc-400">{t}</span>
            ))}
          </div>
        </GlassCard>

        <div className="space-y-4">
          {product.metrics && Object.keys(product.metrics).length > 0 && (
            <GlassCard index={1}>
              <h3 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-3">Metrics</h3>
              <div className="space-y-2">
                {Object.entries(product.metrics).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500 capitalize">{key}</span>
                    <span className="text-xs font-medium text-zinc-200">{String(value)}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {product.links.length > 0 && (
            <GlassCard index={2}>
              <h3 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-3">Links</h3>
              <div className="space-y-2">
                {product.links.map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {link.label}
                  </a>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
