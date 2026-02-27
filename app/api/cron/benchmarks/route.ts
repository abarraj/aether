import { NextResponse } from 'next/server';

import { computeIndustryBenchmarks } from '@/lib/data/benchmark-aggregator';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await computeIndustryBenchmarks();
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Benchmark computation failed:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

