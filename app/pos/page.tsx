'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PosAliasPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/employee');
  }, [router]);

  return <div className="min-h-screen bg-slate-100 text-slate-700 flex items-center justify-center">Redirecting to POS...</div>;
}


