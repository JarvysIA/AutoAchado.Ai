// whatsapp-web.js calls inject from an async browser event listener. Its rejected
// promise otherwise escapes initialize() and terminates Node during navigation.
export function guardInjection(client,{onRetry=()=>{},onFailure,delay=ms=>new Promise(r=>setTimeout(r,ms)),attempts=3}) {
 const inject=client.inject.bind(client);
 let pending;
 client.inject=(...args)=>{
  if(pending)return pending;
  pending=(async()=>{
   try {
    for(let attempt=0;attempt<attempts;attempt++) {
     try {return await inject(...args);}catch(error){
      const transient=/Execution context was destroyed|Cannot find context|detached Frame|Navigating frame was detached/i.test(error?.message??'');
      if(!transient||attempt===attempts-1){onFailure(error);return;}
      onRetry();await delay(2000);
     }
    }
   }finally{pending=undefined;}
  })();
  return pending;
 };
}
