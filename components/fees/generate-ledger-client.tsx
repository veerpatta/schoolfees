"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyPlus, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { type LedgerGenerationPreview } from "@/lib/fees/generator";
    

type GenerateLedgerClientProps = {
  previewAction: () => Promise<LedgerGenerationPreview>;
  submitAction: () => Promise<{ success: boolean; message: string }>;
};

export function GenerateLedgerClient({ previewAction, submitAction }: GenerateLedgerClientProps) {
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<LedgerGenerationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    previewAction()
      .then(setPreview)
      .catch((err) => setError(err.message || "Failed to load preview."))
      .finally(() => setLoading(false));
  }, [previewAction]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await submitAction();
      if (result.success) {
        setSuccess(result.message);
        // re-fetch preview
        const newPreview = await previewAction();
        setPreview(newPreview);
      } else {
        setError(result.message);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center space-x-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/protected/fee-setup">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Fee Setup
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-xl">
            <CopyPlus className="h-5 w-5 text-blue-600" />
            <span>Generate Session Ledgers</span>
          </CardTitle>
          <CardDescription>
            This action creates fee installments for all active students based on class defaults and individual overrides. It is safe to run multiple times (duplicates will be skipped).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex animate-pulse flex-col items-center justify-center space-y-2 py-8 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              <p>Analyzing fee structures...</p>
            </div>
          ) : error && !preview ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900 flex space-x-3 text-sm">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
              <div>
                <h4 className="font-semibold text-red-800">Error Loading Preview</h4>
                <p>{error}</p>
              </div>
            </div>
          ) : preview ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-4 text-sm font-semibold text-slate-900">Preview Summary</h3>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-slate-500">Active Students</dt>
                  <dd className="mt-1 text-2xl font-semibold text-slate-900">{preview.totalActiveStudents}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-slate-500">Students with Fee Settings</dt>
                  <dd className="mt-1 text-2xl font-semibold text-slate-900">
                    {preview.studentsWithFeeSettings}
                    {preview.studentsWithFeeSettings < preview.totalActiveStudents && (
                      <span className="ml-2 text-xs font-normal text-amber-600">
                        ({preview.totalActiveStudents - preview.studentsWithFeeSettings} missing settings)
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-slate-500">Total Projected Installments</dt>
                  <dd className="mt-1 text-2xl font-semibold text-slate-900">{preview.totalInstallmentsAfterGeneration}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-slate-500">Estimated New Installments</dt>
                  <dd className="mt-1 text-2xl font-semibold text-blue-600">~{preview.installmentsToGenerate}</dd>
                </div>
              </dl>
              {preview.studentsWithFeeSettings === 0 && (
                <div className="mt-4 rounded-md bg-yellow-50 p-4 text-yellow-800 text-sm">
                  You must save Class Fee Defaults in the Fee Setup page before ledgers can be generated.
                </div>
              )}
            </div>
          ) : null}

          {error && preview && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900 flex space-x-3 text-sm">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
              <div>
                <h4 className="font-semibold text-red-800">Generation Failed</h4>
                <p>{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 flex space-x-3 text-sm">
              <CopyPlus className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <h4 className="font-semibold text-emerald-800">Success</h4>
                <p>{success}</p>
              </div>
            </div>
          )}

        </CardContent>
        <CardFooter className="bg-slate-50 px-6 py-4 flex justify-between">
          <p className="text-xs text-slate-500">
            This operation is logged and idempotently tracked.
          </p>
          <Button 
            onClick={handleGenerate} 
            disabled={loading || generating || !preview || preview.studentsWithFeeSettings === 0}
            className="w-full sm:w-auto"
          >
            {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {generating ? "Generating..." : "Generate Ledgers"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
