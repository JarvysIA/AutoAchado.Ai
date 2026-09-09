import type {SupabaseClient} from '@supabase/supabase-js';
export async function automotiveCollectionScope(client:SupabaseClient) {
 const {data,error}=await client.from('commercial_verticals').select('enabled,executor_ready,history_batch_size')
  .eq('vertical_key','AUTOMOTIVE').single();
 if(error||!data?.enabled||!data.executor_ready||!Number.isInteger(data.history_batch_size)||data.history_batch_size<1||data.history_batch_size>25)
  throw new Error('COMMERCIAL_EXECUTOR_NOT_READY');
 return {vertical:'AUTOMOTIVE' as const,historyBatch:data.history_batch_size as number};
}
