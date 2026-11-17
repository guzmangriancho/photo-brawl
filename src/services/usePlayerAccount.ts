import {useEffect,useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {supabase} from './supabaseClient';
export function usePlayerAccount(){
  const [user,setUser]=useState<User|null>(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    if(!supabase){setLoading(false);return;}
    let mounted=true;
    void supabase.auth.getUser().then(({data})=>{if(mounted){setUser(data.user);setLoading(false);}}).catch(()=>setLoading(false));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
      if(mounted){setUser(session?.user??null);setLoading(false);}
    });
    return()=>{mounted=false;subscription.unsubscribe();};
  },[]);
  return {user,loading};
}
