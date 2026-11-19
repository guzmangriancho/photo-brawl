import {useEffect,useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {supabase} from './supabaseClient';

/** Do not unlock the app with a stale locally cached session: getUser()
 * verifies it with Supabase before exposing the authenticated user. */
export function usePlayerAccount(){
  const [user,setUser]=useState<User|null>(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    // Capture the non-null client for async callbacks; outer null checks do
    // not narrow an imported nullable variable inside nested functions.
    const client=supabase;
    if(!client){setLoading(false);return;}
    let mounted=true;
    let revision=0;
    const verify=async()=>{
      const request=++revision;
      try{
        const {data,error}=await client.auth.getUser();
        if(mounted&&request===revision){setUser(error?null:data.user);setLoading(false);}
      }catch{
        if(mounted&&request===revision){setUser(null);setLoading(false);}
      }
    };
    const {data:{subscription}}=client.auth.onAuthStateChange((event,session)=>{
      if(!mounted)return;
      if(event==='SIGNED_OUT'||!session){
        ++revision;setUser(null);setLoading(false);
      }else{
        // Auth callbacks must not await a Supabase request synchronously.
        window.setTimeout(()=>{if(mounted)void verify();},0);
      }
    });
    void verify();
    return()=>{mounted=false;revision++;subscription.unsubscribe();};
  },[]);
  return {user,loading};
}
