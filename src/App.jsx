import { useState, useRef, useEffect } from "react";
import { api, getToken, setToken, clearToken, mapUser, badgeToFrontend, pollUntil, ApiError } from "./lib/api.js";

const GS = () => (
  <>
    <link href="https://fonts.googleapis.com/css2?family=Pacifico&family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
    <style>{`
      *{box-sizing:border-box;margin:0;padding:0;}
      input,button,textarea{font-family:'DM Sans',sans-serif;}
      ::-webkit-scrollbar{width:3px;} ::-webkit-scrollbar-thumb{background:rgba(168,85,247,0.3);border-radius:4px;}
      @keyframes wiggle{0%,100%{transform:rotate(0deg) scale(1);}20%{transform:rotate(-14deg) scale(1.12);}40%{transform:rotate(10deg) scale(1.06);}60%{transform:rotate(-6deg) scale(1.09);}80%{transform:rotate(4deg) scale(1.04);}}
      @keyframes ringPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,60,172,0.5),0 0 14px rgba(255,60,160,0.35);}50%{box-shadow:0 0 0 8px rgba(255,60,172,0),0 0 28px rgba(255,60,160,0.65);}}
      @keyframes floatY{0%,100%{transform:translateY(0px);}50%{transform:translateY(-5px);}}
      @keyframes shimmerText{0%{background-position:-300% center;}100%{background-position:300% center;}}
      @keyframes glowPulse{0%,100%{filter:drop-shadow(0 0 4px rgba(255,100,180,0.4));}50%{filter:drop-shadow(0 0 12px rgba(255,100,180,0.9)) drop-shadow(0 0 24px rgba(168,85,247,0.5));}}
      @keyframes slideInChar{0%{opacity:0;transform:translateY(14px) scale(0.75);}70%{opacity:1;transform:translateY(-2px) scale(1.04);}100%{opacity:1;transform:translateY(0) scale(1);}}
      @keyframes orbitA{from{transform:rotate(0deg) translateX(22px) rotate(0deg);}to{transform:rotate(360deg) translateX(22px) rotate(-360deg);}}
      @keyframes orbitB{from{transform:rotate(180deg) translateX(18px) rotate(-180deg);}to{transform:rotate(540deg) translateX(18px) rotate(-540deg);}}
      @keyframes fadeUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
      @keyframes recordPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(255,59,92,0.7);}50%{transform:scale(1.06);box-shadow:0 0 0 14px rgba(255,59,92,0);}}
      @keyframes liveFlash{0%,100%{opacity:1;}50%{opacity:0.2;}}
      @keyframes spinRing{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
      @keyframes slideUp{from{opacity:0;transform:translateY(100%);}to{opacity:1;transform:translateY(0);}}
      @keyframes shortProgress{from{width:0%;}to{width:100%;}}
      @keyframes watermark{0%,100%{opacity:0.18;}50%{opacity:0.28;}}
      .icon-bounce{animation:wiggle 2.4s ease-in-out infinite;display:inline-block;}
      .ring-pulse{animation:ringPulse 2.4s ease-in-out infinite,floatY 3.2s ease-in-out infinite;}
      .text-shimmer{background:linear-gradient(90deg,#ff6ec7 0%,#ff3cac 25%,#c084fc 50%,#ff3cac 75%,#ff6ec7 100%);background-size:300% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:shimmerText 3.5s linear infinite,glowPulse 2.2s ease-in-out infinite;}
      .orbit-a{position:absolute;width:6px;height:6px;border-radius:50%;background:linear-gradient(135deg,#ff3cac,#a855f7);top:50%;left:50%;margin:-3px 0 0 -3px;animation:orbitA 2.8s linear infinite;}
      .orbit-b{position:absolute;width:4px;height:4px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#ff6ec7);top:50%;left:50%;margin:-2px 0 0 -2px;animation:orbitB 2s linear infinite;}
      .rec-pulse{animation:recordPulse 1.2s ease-in-out infinite;}
      .live-flash{animation:liveFlash 1s step-end infinite;}
      .fade-up{animation:fadeUp .4s ease both;}
      .wm{animation:watermark 3s ease-in-out infinite;}
      @keyframes shake{0%,100%{transform:translateX(0);}20%{transform:translateX(-8px);}40%{transform:translateX(8px);}60%{transform:translateX(-6px);}80%{transform:translateX(6px);}}
      @keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(.85);}}
      .shake{animation:shake .4s ease;}
    `}</style>
  </>
);

const C={
  bg:"#0E0718",bgCard:"#1A0D2E",bgAlt:"#150925",
  pink:"#FF3CAC",pinkL:"rgba(255,60,172,0.13)",
  purple:"#A855F7",purpleL:"rgba(168,85,247,0.13)",
  gold:"#FFD700",goldL:"rgba(255,215,0,0.11)",
  green:"#00E5A0",greenL:"rgba(0,229,160,0.11)",
  red:"#FF3B5C",redL:"rgba(255,59,92,0.11)",
  peach:"#FF9A76",text:"#F0E8FF",sub:"#8B7AA8",
  border:"rgba(168,85,247,0.17)",borderH:"rgba(255,60,172,0.38)",
};
const BUM_OK=["Silver Queen","Gold Queen","Platinum","Diamond"];
const LIVE_OK=["Gold Queen","Platinum","Diamond"];
// Contact-reveal price (GHS) scales with the creator's badge tier — higher-reputation
// creators command a higher unlock price. Server should be the source of truth for this
// in production; this map is UI-only.
const CONTACT_PRICE={"Newcomer":5,"Rising Star":8,"Silver Queen":12,"Gold Queen":15,"Platinum":25,"Diamond":40};
// Maps a backend post {id,userId,videoUrl,caption,moveTag,kind,likesCount,
// commentsCount,createdAt,likedByMe} into the shape the existing feed/short
// rendering code expects. Real comments are fetched lazily (on expand),
// not embedded here — commentsCount is just the number for the badge.
function mapPost(p){
  return{
    id:p.id,userId:p.userId,move:p.moveTag,caption:p.caption,
    likes:p.likesCount??0,comments:[],commentsCount:p.commentsCount??0,
    timeAgo:timeAgo(p.createdAt),videoUrl:p.videoUrl,likedByMe:!!p.likedByMe,
    kind:p.kind,duration:15,emoji:"💃", // duration/emoji: ShakyShorts' fallback decorative fields, kept for backward compat with that component's rendering
  };
}
const priceFor=user=>CONTACT_PRICE[user?.badge]||10;
// Formats a backend "YYYY-MM-DD HH:MM:SS" (SQLite) or ISO timestamp as
// relative time ("2m", "3h", "5d") for notification/activity displays.
function timeAgo(ts){
  if(!ts)return"";
  const then=new Date(ts.includes("T")?ts:ts.replace(" ","T")+"Z").getTime();
  const diffSec=Math.max(0,Math.floor((Date.now()-then)/1000));
  if(diffSec<60)return`${diffSec}s`;
  if(diffSec<3600)return`${Math.floor(diffSec/60)}m`;
  if(diffSec<86400)return`${Math.floor(diffSec/3600)}h`;
  return`${Math.floor(diffSec/86400)}d`;
}
// Live Bum sessions are a premium, private product — priced higher than a contact reveal,
// and only offered by Silver Queen+ creators who've opted in (bumEnabled).
// Live Bum sessions are billed by duration, not flat rate — MoMo can't meter continuously
// (every charge is a one-time STK-style prompt), so we charge once per fixed-length
// block instead of trying to run a live per-minute meter.
const BUM_RATE_PER_MIN={"Silver Queen":1.2,"Gold Queen":2,"Platinum":3.5,"Diamond":6};
const bumRateFor=user=>BUM_RATE_PER_MIN[user?.badge]||1;
const BUM_DURATIONS=[15,30]; // minutes
const BUM_EXTEND_MIN=15; // fixed extension block, same rate as the base session
const bumPriceFor=(user,mins)=>Math.round(bumRateFor(user)*mins*100)/100;
// Platform's cut of both contact-reveal and Bum-session payments. Creator receives the rest,
// released via the Split/Transfer API only after they approve — see momo_integration_guide.md.
const PLATFORM_CUT=0.30;
const creatorCut=amount=>Math.round(amount*(1-PLATFORM_CUT)*100)/100;

// ── CONTACT-INFO LEAK DETECTOR ──
// Applied to: signup username, bio, video captions, comments — anywhere free text
// can reach another user before a paid+approved contact exchange. This is a
// client-side heuristic for the demo; production should run the same checks
// server-side (so it can't be bypassed by editing the request) and add the
// speech-to-text/OCR video scan described in momo_integration_guide.md.
const DIGIT_WORDS=["zero","oh","one","two","three","four","five","six","seven","eight","nine"];
const CONTACT_KEYWORDS=[
  "whatsapp","wa.me","w.me","t.me","telegram","snapchat","snap:","snap me",
  "ig:","insta:","instagram.com","facebook.com","fb.com","tiktok:",
  "call me","text me","dm me on","reach me at","contact me at","my whatsapp",
  "add me on","hit me up","message me on","email me at",
];
function scanContactInfo(text){
  if(!text||!text.trim())return{flagged:false};
  const raw=text, t=text.toLowerCase();

  // Email address
  if(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(raw))
    return{flagged:true,reason:"an email address"};

  // Digit run that looks like a phone number (allows spaces/dots/dashes/parens between groups)
  if(/(?:\d[\s.\-()]*){7,}/.test(raw))
    return{flagged:true,reason:"a phone number"};

  // Spelled-out digit sequence ("zero two four one two three...")
  const wp=new RegExp(`\\b(${DIGIT_WORDS.join("|")})\\b(?:[\\s,-]+\\b(${DIGIT_WORDS.join("|")})\\b){5,}`,"i");
  if(wp.test(raw))
    return{flagged:true,reason:"a spelled-out phone number"};

  // Known contact-sharing keywords / platforms
  for(const k of CONTACT_KEYWORDS){
    if(t.includes(k))return{flagged:true,reason:`a mention of "${k}"`};
  }

  return{flagged:false};
}
// Generates safe alternative handles when one is taken or flagged, similar to
// how Instagram/Twitter suggest alternates on a rejected signup handle.
function suggestHandles(base){
  const clean=(base||"dancer").toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,14)||"dancer";
  const suffixes=()=>Math.floor(Math.random()*900+100);
  return[`${clean}${suffixes()}`,`${clean}_dance`,`the_${clean}`];
}

const INIT_USERS=[
  {id:1,name:"Amara Osei",    handle:"amarabeats",avatar:"A",color:"#FF3CAC",bio:"Afrobeats queen 🌍",   moves:24,followers:3200,following:210,badge:"Gold Queen",  contact:"amara@gmail.com",phone:"+44 7700 900001",bumEnabled:true, online:true, allowDownload:true},
  {id:2,name:"Zara Williams", handle:"zarawave",  avatar:"Z",color:"#A855F7",bio:"Belly dance lover ✨", moves:18,followers:1890,following:340,badge:"Silver Queen",contact:"zara@gmail.com", phone:"+44 7700 900002",bumEnabled:true, online:false,allowDownload:false},
  {id:3,name:"Sofia Cruz",    handle:"salsaqueen",avatar:"S",color:"#FF9A76",bio:"Latin fire 🔥",       moves:31,followers:5100,following:180,badge:"Platinum",     contact:"sofia@gmail.com",phone:"+44 7700 900003",bumEnabled:true, online:true, allowDownload:true},
  {id:4,name:"Nana Addo",     handle:"nanagold",  avatar:"N",color:"#4CC9F0",bio:"Azonto is life 💫",  moves:12,followers:980, following:520,badge:"Newcomer",     contact:"nana@gmail.com", phone:"+44 7700 900004",bumEnabled:false,online:false,allowDownload:true},
  {id:5,name:"Isla Thompson", handle:"islandvibe",avatar:"I",color:"#F72585",bio:"Dancehall 🎵",       moves:22,followers:2340,following:290,badge:"Gold Queen",   contact:"isla@gmail.com", phone:"+44 7700 900005",bumEnabled:true, online:true, allowDownload:false},
  {id:6,name:"Ama Boateng",   handle:"afrogyal",  avatar:"A",color:"#7FFF00",bio:"Dance is therapy 💚",moves:9, followers:670, following:410,badge:"Rising Star", contact:"ama@gmail.com",  phone:"+44 7700 900006",bumEnabled:false,online:false,allowDownload:true},
];
const ME={id:0,name:"ShakyStar",handle:"shakystar",avatar:"💃",color:"#FF3CAC",bio:"Waist moves only 🔥",moves:12,followers:1200,following:88,badge:"Gold Queen",bumEnabled:true,allowDownload:true,videoUrl:null};

const MOVES=[
  {id:1,name:"Waist Wine",    cat:"Afrobeats",  emoji:"🌀",level:"Beginner",    likes:2341,creator:INIT_USERS[0]},
  {id:2,name:"Belly Roll",    cat:"Belly Dance",emoji:"✨",level:"Intermediate",likes:1892,creator:INIT_USERS[1]},
  {id:3,name:"Shakira Twist", cat:"Latin",      emoji:"🔥",level:"Beginner",    likes:3102,creator:INIT_USERS[2]},
  {id:4,name:"Azonto Waist",  cat:"Afrobeats",  emoji:"💫",level:"Advanced",    likes:987, creator:INIT_USERS[3]},
  {id:5,name:"Dancehall Dip", cat:"Dancehall",  emoji:"🎵",level:"Intermediate",likes:1543,creator:INIT_USERS[4]},
  {id:6,name:"Tummy Pop",     cat:"Afrobeats",  emoji:"⚡",level:"Beginner",    likes:2210,creator:INIT_USERS[5]},
  {id:7,name:"Hip Circle",    cat:"Belly Dance",emoji:"🌸",level:"Beginner",    likes:1120,creator:INIT_USERS[1]},
  {id:8,name:"Soca Whine",    cat:"Dancehall",  emoji:"🎶",level:"Intermediate",likes:890, creator:INIT_USERS[4]},
];
const INIT_CHALLENGES=[
  {id:1,title:"7-Day Wine Challenge",move:"Waist Wine",   participants:834, daysLeft:3,host:INIT_USERS[0]},
  {id:2,title:"Belly Queen Weekly",  move:"Belly Roll",   participants:412, daysLeft:5,host:INIT_USERS[1]},
  {id:3,title:"Shakira Showdown",    move:"Shakira Twist",participants:1203,daysLeft:1,host:INIT_USERS[2]},
  {id:4,title:"Afrobeats Battle",    move:"Azonto Waist", participants:567, daysLeft:6,host:INIT_USERS[3]},
];
const TUTORIALS=[
  {id:1,title:"Waist Wine Basics",      dur:"4:30", level:"Beginner",    emoji:"🌀",views:"12k", creator:INIT_USERS[0]},
  {id:2,title:"Hip Isolation 101",      dur:"6:15", level:"Beginner",    emoji:"✨",views:"8.4k",creator:INIT_USERS[1]},
  {id:3,title:"Belly Roll Masterclass", dur:"9:00", level:"Intermediate",emoji:"💫",views:"5.1k",creator:INIT_USERS[1]},
  {id:4,title:"Dancehall Foundation",   dur:"7:45", level:"Intermediate",emoji:"🎵",views:"3.2k",creator:INIT_USERS[4]},
  {id:5,title:"Advanced Waist Control", dur:"12:00",level:"Advanced",    emoji:"🔥",views:"2.1k",creator:INIT_USERS[2]},
];
const INIT_POSTS=[
  {id:1,userId:1,move:"Waist Wine",    caption:"New personal best 🌀🔥",        likes:342,comments:["Omg yes queen! 🔥","Immaculate 😍"],timeAgo:"2m"},
  {id:2,userId:3,move:"Shakira Twist", caption:"Latin vibes only 💃✨",           likes:891,comments:["You ate girl! 💃"],              timeAgo:"15m"},
  {id:3,userId:2,move:"Belly Roll",    caption:"Smooth like silk 😌✨",           likes:231,comments:["Teach me!!! 🙏"],               timeAgo:"1h"},
  {id:4,userId:5,move:"Dancehall Dip", caption:"Island energy never stops 🎵🌴",  likes:512,comments:["Dancehall queen 👑","Yes!!"],    timeAgo:"2h"},
];
const INIT_NOTIFS=[
  {id:1,type:"like",     user:INIT_USERS[0],msg:"liked your Waist Wine video",        time:"2m", read:false},
  {id:2,type:"challenge",user:INIT_USERS[2],msg:"invited you to Shakira Showdown 🏆", time:"10m",read:false},
  {id:3,type:"contact",  user:INIT_USERS[1],msg:"requested your contact details 📬",  time:"30m",read:false},
  {id:4,type:"bum",      user:INIT_USERS[0],msg:"sent you a Live Bum session request 🍑",  time:"45m",read:false},
  {id:5,type:"short",    user:INIT_USERS[3],msg:"posted a new ShakyShort 🎬",         time:"1h", read:true},
  {id:6,type:"live",     user:INIT_USERS[4],msg:"went live: Dancehall Masterclass 🔴", time:"2h", read:true},
];

const INIT_SHORTS=[
  {id:1,userId:1,caption:"Morning wine routine ☀️🌀",emoji:"🌀",likes:892,views:4200,timeAgo:"10m",duration:8},
  {id:2,userId:3,caption:"Shakira who? 😂🔥",         emoji:"🔥",likes:1203,views:7800,timeAgo:"25m",duration:12},
  {id:3,userId:5,caption:"Dancehall dip tutorial 💦",  emoji:"🎵",likes:567,views:2900,timeAgo:"1h",duration:7},
  {id:4,userId:2,caption:"Belly roll slowmo ✨",        emoji:"✨",likes:445,views:1800,timeAgo:"2h",duration:15},
  {id:5,userId:6,caption:"Morning stretch turns into dancing 😭💚",emoji:"⚡",likes:234,views:980,timeAgo:"3h",duration:9},
];

const CATS=["All","Afrobeats","Dancehall","Latin","Belly Dance"];
const NAV=[{label:"Home",icon:"🏠"},{label:"Explore",icon:"🔍"},{label:"Shorts",icon:"⚡"},{label:"Community",icon:"👯"},{label:"Learn",icon:"📚"},{label:"Challenges",icon:"🏆"},{label:"Profile",icon:"👤"}];

// ── SHARED COMPONENTS ──
function Logo({size="md"}) {
  const s={sm:{w:28,e:13,f:16,g:7},md:{w:40,e:19,f:24,g:10},lg:{w:56,e:26,f:32,g:12},xl:{w:90,e:42,f:52,g:18}}[size]||{w:40,e:19,f:24,g:10};
  const [rdy,setRdy]=useState(false);
  useEffect(()=>{setTimeout(()=>setRdy(true),80);},[]);
  return (
    <div style={{display:"flex",alignItems:"center",gap:s.g}}>
      <div className="ring-pulse" style={{width:s.w,height:s.w,borderRadius:"50%",background:"radial-gradient(circle at 35% 35%,#2e0a40,#0e0718)",border:"2px solid #ff3cac",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",flexShrink:0}}>
        {size!=="sm"&&<><div className="orbit-a"/><div className="orbit-b"/></>}
        <div style={{position:"absolute",inset:3,borderRadius:"50%",background:"radial-gradient(circle,rgba(255,60,172,0.2) 0%,transparent 70%)"}}/>
        <span className="icon-bounce" style={{fontSize:s.e,position:"relative",zIndex:1,lineHeight:1}}>🍑</span>
      </div>
      <div style={{display:"flex",alignItems:"baseline"}}>
        {"Shakybum".split("").map((ch,i)=>(
          <span key={i} className="text-shimmer" style={{fontFamily:"'Pacifico',cursive",fontSize:s.f,letterSpacing:.5,opacity:rdy?1:0,animation:rdy?`slideInChar .45s cubic-bezier(.34,1.56,.64,1) ${i*.055}s both,shimmerText 3.5s linear infinite,glowPulse 2.2s ease-in-out infinite`:"shimmerText 3.5s linear infinite"}}>{ch}</span>
        ))}
      </div>
    </div>
  );
}

// Watermark overlay for all videos
function VideoWatermark() {
  return (
    <div className="wm" style={{position:"absolute",bottom:10,right:10,display:"flex",alignItems:"center",gap:4,background:"rgba(0,0,0,0.45)",borderRadius:8,padding:"3px 8px",pointerEvents:"none",zIndex:10}}>
      <span style={{fontSize:10}}>🍑</span>
      <span style={{fontFamily:"'Pacifico',cursive",fontSize:9,background:"linear-gradient(90deg,#ff6ec7,#ff3cac,#c084fc)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>shakybum</span>
    </div>
  );
}

function VideoAvatar({user,size=44,isLive=false,onClick,showVideo=false}) {
  return (
    <div onClick={onClick} style={{position:"relative",flexShrink:0,width:size,height:size,cursor:onClick?"pointer":"default"}}>
      <div style={{position:"absolute",inset:-2.5,borderRadius:"50%",background:isLive?"linear-gradient(135deg,#FF3B5C,#FF9A76)":"linear-gradient(135deg,#FF3CAC,#A855F7)",zIndex:0}}/>
      <div style={{position:"absolute",inset:0,borderRadius:"50%",overflow:"hidden",border:`2px solid ${C.bg}`,zIndex:1,background:`linear-gradient(135deg,${user.color}30,${user.color}10)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:user.color,fontSize:size*.38}}>
        {showVideo&&user.videoUrl?<video src={user.videoUrl} autoPlay muted loop playsInline style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          :showVideo?<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.5,animation:"wiggle 2s ease-in-out infinite"}}>{user.avatar}</div>
          :<span>{user.avatar}</span>}
      </div>
      {user.online&&!isLive&&<div style={{position:"absolute",bottom:1,right:1,width:Math.max(8,size*.18),height:Math.max(8,size*.18),borderRadius:"50%",background:C.green,border:`2px solid ${C.bg}`,zIndex:2}}/>}
      {isLive&&<div style={{position:"absolute",bottom:-5,left:"50%",transform:"translateX(-50%)",background:"#FF3B5C",borderRadius:6,padding:"2px 5px",fontSize:7,fontWeight:800,color:"#fff",border:`1.5px solid ${C.bg}`,whiteSpace:"nowrap",zIndex:2,display:"flex",alignItems:"center",gap:2}}><span className="live-flash">●</span>LIVE</div>}
    </div>
  );
}

// Profile Video Viewer Modal
function ProfileVideoModal({user,onClose}) {
  if(!user)return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",maxWidth:390,margin:"0 auto"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:390,display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"0 20px"}}>
        <div style={{width:"100%",aspectRatio:"9/16",borderRadius:20,overflow:"hidden",background:"linear-gradient(135deg,#1a0d2e,#0e0718)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",border:`2px solid ${user.color}55`,maxHeight:480}}>
          {user.videoUrl?(
            <video src={user.videoUrl} autoPlay loop controls playsInline style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          ):(
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:100,animation:"wiggle 2s ease-in-out infinite"}}>{user.avatar}</div>
              <div style={{fontSize:14,color:C.sub,marginTop:12}}>@{user.handle}'s dance profile</div>
              <div style={{fontSize:12,color:C.sub,marginTop:4,opacity:.6}}>No profile video yet</div>
            </div>
          )}
          <VideoWatermark/>
          <div style={{position:"absolute",top:12,left:12}}><span style={{background:`${user.color}33`,border:`1px solid ${user.color}66`,borderRadius:8,padding:"3px 10px",fontSize:11,fontWeight:700,color:user.color}}>{user.badge}</span></div>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{fontWeight:800,fontSize:18,color:C.text}}>{user.name}</div>
          <div style={{fontSize:13,color:C.sub}}>@{user.handle} · {user.moves} moves · {user.followers.toLocaleString()} followers</div>
        </div>
        <button onClick={onClose} style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:14,padding:"10px 32px",color:C.sub,fontWeight:700,fontSize:14,cursor:"pointer"}}>✕ Close</button>
      </div>
    </div>
  );
}

const Card=({children,style={},onClick})=>(
  <div onClick={onClick} style={{background:C.bgCard,borderRadius:20,border:`1px solid ${C.border}`,overflow:"hidden",cursor:onClick?"pointer":"default",...style}}>{children}</div>
);
const Bdg=({text,color=C.pink})=>(
  <span style={{fontSize:10,background:`${color}20`,color,padding:"3px 9px",borderRadius:20,fontWeight:700,border:`1px solid ${color}35`,whiteSpace:"nowrap"}}>{text}</span>
);
const BumBadge=()=><span style={{fontSize:10,background:"rgba(255,215,0,0.18)",color:C.gold,padding:"3px 9px",borderRadius:20,fontWeight:700,border:`1px solid ${C.gold}44`}}>🍑 BUM</span>;
const LiveBadge=()=><span style={{fontSize:10,background:"rgba(255,59,92,0.18)",color:"#FF3B5C",padding:"3px 9px",borderRadius:20,fontWeight:700,border:"1px solid rgba(255,59,92,0.4)",display:"inline-flex",alignItems:"center",gap:3}}><span className="live-flash">●</span>LIVE</span>;

function GBtn({children,onClick,gold=false,outline=false,red=false,disabled=false,small=false,warn=false,style={}}) {
  const bg=disabled?"rgba(168,85,247,0.1)":gold?"linear-gradient(135deg,#FFD700,#FF9A76)":red?"linear-gradient(135deg,#FF3B5C,#FF6B6B)":warn?"rgba(255,154,118,0.15)":outline?"transparent":"linear-gradient(135deg,#FF3CAC,#A855F7)";
  const brd=outline?`1.5px solid ${C.pink}`:warn?`1.5px solid ${C.peach}`:"none";
  const col=disabled?C.sub:gold?"#0E0718":warn?C.peach:"#fff";
  return <button onClick={disabled?undefined:onClick} style={{width:"100%",border:brd,borderRadius:small?10:14,padding:small?"7px 14px":"13px 20px",fontWeight:700,fontSize:small?12:14,cursor:disabled?"not-allowed":"pointer",background:bg,color:col,opacity:disabled?.5:1,...style}}>{children}</button>;
}
const Toast=({msg})=>msg?<div style={{position:"fixed",top:54,left:"50%",transform:"translateX(-50%)",background:"rgba(14,7,24,0.97)",backdropFilter:"blur(20px)",border:`1px solid ${C.borderH}`,color:C.text,borderRadius:14,padding:"11px 22px",fontSize:13,fontWeight:600,zIndex:9999,whiteSpace:"nowrap",boxShadow:"0 8px 30px rgba(255,60,172,0.25)",maxWidth:320,textAlign:"center"}}>{msg}</div>:null;

// Settings Screen
function SettingsScreen({onClose,showToast}) {
  const [downloadOn,setDownloadOn]=useState(ME.allowDownload);
  const [privateAcc,setPrivateAcc]=useState(false);
  const [watermarkOn,setWatermarkOn]=useState(true);
  const [shorts,setShortsOn]=useState(true);
  const [notifOn,setNotifOn]=useState(true);

  const Toggle=({val,set,label,sub,icon})=>(
    <div style={{background:C.bgCard,borderRadius:14,padding:"14px 16px",marginBottom:8,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}}>
      <div style={{fontSize:22,flexShrink:0}}>{icon}</div>
      <div style={{flex:1}}>
        <div style={{fontWeight:700,fontSize:13,color:C.text}}>{label}</div>
        <div style={{fontSize:11,color:C.sub,marginTop:2}}>{sub}</div>
      </div>
      <div onClick={()=>{set(!val);showToast(val?"Disabled":"Enabled ✓");}} style={{width:46,height:26,borderRadius:13,background:val?"linear-gradient(135deg,#FF3CAC,#A855F7)":C.bgAlt,border:`1px solid ${val?C.pink:C.border}`,cursor:"pointer",position:"relative",transition:"all .3s",flexShrink:0}}>
        <div style={{width:20,height:20,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:val?23:3,transition:"left .3s",boxShadow:"0 2px 6px rgba(0,0,0,0.4)"}}/>
      </div>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`,zIndex:700,display:"flex",flexDirection:"column",maxWidth:390,margin:"0 auto"}}>
      <div style={{padding:"52px 20px 16px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onClose} style={{background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:12,width:38,height:38,cursor:"pointer",fontSize:18,color:C.text}}>✕</button>
        <div style={{fontFamily:"'Pacifico',cursive",fontSize:20,color:C.text}}>Settings ⚙️</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 20px"}}>
        <div style={{fontSize:11,color:C.sub,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>Privacy & Downloads</div>
        <Toggle val={downloadOn} set={setDownloadOn} icon="⬇️" label="Allow Video Downloads" sub="Let others download your videos. Shakybum watermark always applied." />
        <Toggle val={privateAcc} set={setPrivateAcc} icon="🔒" label="Private Account" sub="Only approved followers can see your content." />
        <Toggle val={watermarkOn} set={setWatermarkOn} icon="🍑" label="Shakybum Watermark" sub="Your videos always carry the Shakybum brand mark. Cannot be disabled for community trust." />
        <div style={{fontSize:11,color:C.sub,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",margin:"20px 0 10px"}}>Features</div>
        <Toggle val={shorts} set={setShortsOn} icon="⚡" label="ShakyShorts" sub="Allow others to see your short videos in the Shorts feed." />
        <Toggle val={notifOn} set={setNotifOn} icon="🔔" label="Push Notifications" sub="Get notified about likes, Live Bum requests, challenges and more." />
        <div style={{fontSize:11,color:C.sub,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",margin:"20px 0 10px"}}>Account</div>
        {[["🎨","Edit Profile Theme"],["📊","Analytics & Insights"],["🔗","Linked Accounts"],["🌍","Language & Region"],["♿","Accessibility"],["📜","Community Guidelines"],["🔏","Two-Factor Authentication"],["🗑️","Delete Account",true]].map(([ic,label,danger])=>(
          <div key={label} onClick={()=>showToast(`${label} — coming soon`)} style={{background:C.bgCard,padding:"14px 16px",borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13,cursor:"pointer",border:`1px solid ${C.border}`,marginBottom:6,color:danger?"#FF3B5C":C.text}}>
            <span>{ic} {label}</span><span style={{color:C.sub}}>›</span>
          </div>
        ))}
        <div style={{height:30}}/>
      </div>
    </div>
  );
}

// Privacy & Safety Screen
function PrivacyScreen({onClose,showToast}) {
  return (
    <div style={{position:"fixed",inset:0,background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`,zIndex:700,display:"flex",flexDirection:"column",maxWidth:390,margin:"0 auto"}}>
      <div style={{padding:"52px 20px 16px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onClose} style={{background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:12,width:38,height:38,cursor:"pointer",fontSize:18,color:C.text}}>✕</button>
        <div style={{fontFamily:"'Pacifico',cursive",fontSize:20,color:C.text}}>Privacy & Safety 🔒</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 20px"}}>
        <div style={{background:"rgba(255,215,0,0.08)",borderRadius:16,padding:"16px",border:`1px solid ${C.gold}33`,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,color:C.gold,marginBottom:6}}>🛡️ Your Data is Protected</div>
          <div style={{fontSize:12,color:C.sub,lineHeight:1.7}}>Your contact details (email, phone) are hidden by default. They are encrypted at rest and only revealed to users you manually approve. Shakybum never sells your data.</div>
        </div>
        <div style={{background:C.redL,borderRadius:16,padding:"16px",border:`1px solid ${C.red}55`,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:800,color:C.red,marginBottom:6}}>⚠️ Zero-Tolerance: No Off-Platform Contact Sharing</div>
          <div style={{fontSize:12,color:C.sub,lineHeight:1.7}}>Sharing phone numbers, WhatsApp, email, Instagram, Telegram, Snapchat or any other contact info — in your username, bio, video captions, comments, live chat, or spoken in a video — is strictly against Shakybum's Terms of Service.</div>
          <div style={{fontSize:12,color:C.text,fontWeight:700,lineHeight:1.7,marginTop:8}}>Any user found doing this will be permanently banned, no warning required for repeat or deliberate attempts. Paid, approved Contact Requests are the only permitted way to exchange contact details on Shakybum.</div>
        </div>
        {[
          {icon:"🔒",title:"Contact Visibility",desc:"Your email and phone are always hidden. Only users you approve can see them.",action:"Manage"},
          {icon:"🚫",title:"Blocked Users",desc:"Manage users you've blocked. They cannot see your profile, videos or contact you.",action:"View (0)"},
          {icon:"🍑",title:"Bum Request Control",desc:"Only Silver Queen+ creators can receive paid Live Bum requests. You keep 70% of every session, held in escrow until you confirm.",action:"Manage"},
          {icon:"🎬",title:"Video Download Control",desc:"Choose who can download your videos. Shakybum watermark is always applied.",action:"Settings"},
          {icon:"📍",title:"Location Data",desc:"Shakybum does not collect or store your precise location data.",action:"Info"},
          {icon:"🗂️",title:"Download My Data",desc:"Request a copy of all your Shakybum data (GDPR Art. 20).",action:"Request"},
          {icon:"🗑️",title:"Delete My Account",desc:"Permanently delete your account and all data within 30 days.",action:"Delete"},
        ].map((item,i)=>(
          <div key={i} style={{background:C.bgCard,borderRadius:14,padding:"14px 16px",marginBottom:8,border:`1px solid ${C.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{fontSize:22,flexShrink:0}}>{item.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13,color:C.text,marginBottom:2}}>{item.title}</div>
                <div style={{fontSize:11,color:C.sub,lineHeight:1.5}}>{item.desc}</div>
              </div>
              <button onClick={()=>showToast(`${item.title} — coming soon`)} style={{background:C.purpleL,border:`1px solid ${C.purple}44`,borderRadius:10,padding:"6px 12px",color:C.purple,fontWeight:700,fontSize:11,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>{item.action}</button>
            </div>
          </div>
        ))}
        <div style={{height:30}}/>
      </div>
    </div>
  );
}

// Help & Support Screen
function HelpScreen({onClose,showToast}) {
  const [open,setOpen]=useState(null);
  const faqs=[
    {q:"How do I get the LIVE BUM badge?",a:"You need to reach Silver Queen badge or higher and enable Live Bum sessions in your profile settings. Silver Queen requires 5+ moves posted and 500+ followers."},
    {q:"How much do Live Bum sessions cost, and how do I get paid?",a:"Sessions are billed by duration — book 15 or 30 minutes, priced per-minute by badge tier (Silver Queen GHS 1.20/min up to Diamond GHS 6/min). The requester's payment is held until you confirm. Once confirmed, you receive 70% via Mobile Money — the remaining 30% is Shakybum's platform fee. Running long? Either side can pay to extend by 15 more minutes mid-session. Decline and the requester is refunded automatically."},
    {q:"How do contact requests work?",a:"Your contact details are hidden by default. When someone requests your contact, you'll get a notification. You can approve or decline — only after approval can they see your email and phone."},
    {q:"Can I unsend a Bum or contact request?",a:"Yes! Go to Community → Bum tab or Requests tab and tap 'Unsend' next to any pending request you've sent."},
    {q:"What is ShakyShorts?",a:"ShakyShorts are short looping videos (max 15 seconds) that appear in the Shorts feed — similar to TikTok or Reels. They disappear after 24 hours unless you pin them to your profile."},
    {q:"Why is there a Shakybum watermark on my videos?",a:"All videos on Shakybum carry our watermark to protect creators and ensure content is attributed back to our platform. This cannot be removed, even for downloaded videos."},
    {q:"How do I go Live?",a:"You need Gold Queen badge or higher to go live. Tap the LIVE button on the Home screen, set a title and move category, then tap Start."},
    {q:"How do I level up my badge?",a:"Badges are earned by posting moves, joining challenges, gaining followers and being active. Newcomer → Rising Star → Silver Queen → Gold Queen → Platinum → Diamond."},
  ];
  return (
    <div style={{position:"fixed",inset:0,background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`,zIndex:700,display:"flex",flexDirection:"column",maxWidth:390,margin:"0 auto"}}>
      <div style={{padding:"52px 20px 16px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onClose} style={{background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:12,width:38,height:38,cursor:"pointer",fontSize:18,color:C.text}}>✕</button>
        <div style={{fontFamily:"'Pacifico',cursive",fontSize:20,color:C.text}}>Help & Support ❓</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 20px"}}>
        <div style={{background:"linear-gradient(135deg,#FF3CAC,#A855F7)",borderRadius:16,padding:"16px 18px",marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:4}}>💬 Contact Support</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.8)",marginBottom:12}}>Our team responds within 24 hours</div>
          <button onClick={()=>showToast("Support chat coming soon! 💬")} style={{background:"rgba(255,255,255,0.2)",backdropFilter:"blur(8px)",border:"1.5px solid rgba(255,255,255,0.5)",borderRadius:10,padding:"8px 18px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Open Support Chat</button>
        </div>
        <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>Frequently Asked</div>
        {faqs.map((f,i)=>(
          <div key={i} style={{background:C.bgCard,borderRadius:14,marginBottom:8,border:`1px solid ${open===i?C.borderH:C.border}`,overflow:"hidden"}}>
            <div onClick={()=>setOpen(open===i?null:i)} style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
              <span style={{flex:1,fontSize:13,fontWeight:600,color:C.text}}>{f.q}</span>
              <span style={{color:C.sub,fontSize:14}}>{open===i?"▲":"▼"}</span>
            </div>
            {open===i&&<div style={{padding:"0 16px 14px",fontSize:12,color:C.sub,lineHeight:1.7,borderTop:`1px solid ${C.border}`}}><br/>{f.a}</div>}
          </div>
        ))}
        <div style={{height:30}}/>
      </div>
    </div>
  );
}

// My Videos Screen
function MyVideosScreen({onClose,showToast}) {
  const myVids=[
    {id:1,title:"Waist Wine Flow",move:"Waist Wine",emoji:"🌀",likes:342,views:1200,date:"Today"},
    {id:2,title:"Morning Routine",move:"Belly Roll",emoji:"✨",likes:128,views:540,date:"Yesterday"},
    {id:3,title:"Challenge Entry",move:"Shakira Twist",emoji:"🔥",likes:89,views:320,date:"3 days ago"},
  ];
  return (
    <div style={{position:"fixed",inset:0,background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`,zIndex:700,display:"flex",flexDirection:"column",maxWidth:390,margin:"0 auto"}}>
      <div style={{padding:"52px 20px 16px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onClose} style={{background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:12,width:38,height:38,cursor:"pointer",fontSize:18,color:C.text}}>✕</button>
        <div style={{fontFamily:"'Pacifico',cursive",fontSize:20,color:C.text}}>My Videos 🎬</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 20px"}}>
        {myVids.map(v=>(
          <div key={v.id} style={{background:C.bgCard,borderRadius:16,padding:"14px",border:`1px solid ${C.border}`,marginBottom:10,display:"flex",gap:14,alignItems:"center"}}>
            <div style={{width:56,height:56,borderRadius:12,background:`linear-gradient(135deg,${C.pink}20,${C.purple}10)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,position:"relative",flexShrink:0}}>
              {v.emoji}<VideoWatermark/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13,color:C.text,marginBottom:2}}>{v.title}</div>
              <div style={{fontSize:11,color:C.sub}}>{v.move} · {v.date}</div>
              <div style={{display:"flex",gap:12,marginTop:4}}>
                <span style={{fontSize:11,color:C.sub}}>❤️ {v.likes}</span>
                <span style={{fontSize:11,color:C.sub}}>👁 {v.views.toLocaleString()}</span>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <button onClick={()=>showToast("Video options coming soon")} style={{background:C.purpleL,border:`1px solid ${C.purple}44`,borderRadius:8,padding:"5px 10px",color:C.purple,fontWeight:700,fontSize:10,cursor:"pointer"}}>⋯</button>
              <button onClick={()=>showToast("Video deleted")} style={{background:C.redL,border:"1px solid rgba(255,59,92,0.3)",borderRadius:8,padding:"5px 10px",color:"#FF3B5C",fontWeight:700,fontSize:10,cursor:"pointer"}}>🗑</button>
            </div>
          </div>
        ))}
        <div style={{height:30}}/>
      </div>
    </div>
  );
}

// Saved Moves Screen
function SavedMovesScreen({onClose,showToast}) {
  const saved=MOVES.slice(0,4);
  return (
    <div style={{position:"fixed",inset:0,background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`,zIndex:700,display:"flex",flexDirection:"column",maxWidth:390,margin:"0 auto"}}>
      <div style={{padding:"52px 20px 16px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onClose} style={{background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:12,width:38,height:38,cursor:"pointer",fontSize:18,color:C.text}}>✕</button>
        <div style={{fontFamily:"'Pacifico',cursive",fontSize:20,color:C.text}}>Saved Moves ❤️</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 20px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {saved.map(move=>(
          <Card key={move.id}>
            <div style={{background:`linear-gradient(135deg,${move.creator.color}20,${move.creator.color}06)`,padding:"22px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:8,fontSize:40,position:"relative"}}>
              {move.emoji}<Bdg text={move.level} color={move.creator.color}/>
            </div>
            <div style={{padding:"10px 12px 12px"}}>
              <div style={{fontWeight:700,fontSize:13,color:C.text,marginBottom:2}}>{move.name}</div>
              <div style={{fontSize:11,color:C.sub,marginBottom:8}}>{move.cat}</div>
              <button onClick={()=>showToast(`Removed ${move.name} from saved`)} style={{width:"100%",background:C.redL,border:"1px solid rgba(255,59,92,0.25)",borderRadius:8,padding:"6px",color:"#FF3B5C",fontWeight:700,fontSize:11,cursor:"pointer"}}>✕ Remove</button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── USER PROFILE SHEET ──
function UserSheet({user,onClose,following,setFollowing,contactRequests,approvedContacts,bumRequests,showToast,openProfile,requestContact,requestBum,openChat}) {
  if(!user)return null;
  const isF=following.includes(user.id);
  const cSent=(contactRequests.sent||[]).includes(user.id);
  const cOk=approvedContacts.includes(user.id);
  const bSent=(bumRequests.sent||[]).some(r=>r.id===user.id);
  const canBum=BUM_OK.includes(user.badge)&&user.bumEnabled;

  // Held payments can't be cancelled from the payer's side — only the
  // creator can approve/decline (see backend routes). Honest messaging
  // instead of a fake "unsend" that doesn't touch the real held payment.
  const unsendContact=()=>showToast("Payment is held until they respond — it can't be cancelled from your side.");
  const unsendBum=()=>showToast("Payment is held until they respond — it can't be cancelled from your side.");

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(5,0,14,0.88)",backdropFilter:"blur(14px)",zIndex:500,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:`linear-gradient(180deg,#2A0D40,${C.bg})`,borderRadius:"24px 24px 0 0",width:"100%",maxWidth:390,padding:"20px 20px 44px",border:`1px solid ${C.border}`,animation:"slideUp .35s ease"}}>
        <div style={{width:40,height:4,borderRadius:2,background:C.border,margin:"0 auto 18px"}}/>
        <div style={{display:"flex",gap:14,alignItems:"center",marginBottom:14}}>
          <div onClick={()=>{onClose();openProfile(user);}} style={{cursor:"pointer"}}><VideoAvatar user={user} size={64} showVideo/></div>
          <div style={{flex:1}}>
            <div onClick={()=>{onClose();openProfile(user);}} style={{fontWeight:800,fontSize:18,color:C.text,cursor:"pointer",textDecoration:"underline",textDecorationColor:"rgba(255,60,172,0.4)"}}>{user.name}</div>
            <div style={{fontSize:13,color:C.sub}}>@{user.handle}</div>
            <div style={{marginTop:5,display:"flex",gap:5,flexWrap:"wrap"}}>
              <Bdg text={user.badge} color={user.color}/>
              {canBum&&<BumBadge/>}
              {LIVE_OK.includes(user.badge)&&<LiveBadge/>}
            </div>
          </div>
        </div>
        <div style={{fontSize:13,color:C.sub,marginBottom:14}}>{user.bio}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
          {[["Moves",user.moves],["Followers",(user.followers).toLocaleString()],["Following",user.following]].map(([l,v])=>(
            <div key={l} style={{background:C.bgAlt,borderRadius:12,padding:"10px 8px",textAlign:"center",border:`1px solid ${C.border}`}}>
              <div style={{fontSize:16,fontWeight:700,color:C.text}}>{v}</div><div style={{fontSize:10,color:C.sub}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <button onClick={()=>{const f=!isF;setFollowing(p=>f?[...p,user.id]:p.filter(x=>x!==user.id));showToast(f?`Following ${user.name}! 👯`:`Unfollowed ${user.name}`);}} style={{flex:1,background:isF?"transparent":"linear-gradient(135deg,#FF3CAC,#A855F7)",border:isF?`1.5px solid ${C.purple}`:"none",borderRadius:12,padding:"11px",color:isF?C.purple:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>
            {isF?"✓ Following":"+ Follow"}
          </button>
          {!cOk&&(
            cSent
              ?<button onClick={unsendContact} style={{flex:1,background:"transparent",border:`1.5px solid ${C.peach}`,borderRadius:12,padding:"11px",color:C.peach,fontWeight:700,fontSize:12,cursor:"pointer"}}>↩ Unsend Contact</button>
              :<button onClick={()=>requestContact(user)} style={{flex:1,background:C.purpleL,border:`1.5px solid ${C.purple}`,borderRadius:12,padding:"11px",color:C.purple,fontWeight:700,fontSize:13,cursor:"pointer"}}>💳 Contact · GHS {priceFor(user)}</button>
          )}
          {cOk&&<button onClick={()=>{onClose();openChat(user);}} style={{flex:1,background:C.greenL,border:`1.5px solid ${C.green}`,borderRadius:12,padding:"11px",color:C.green,fontWeight:700,fontSize:13,cursor:"pointer"}}>💬 Message</button>}
        </div>
        {canBum&&(
          bSent
            ?<button onClick={unsendBum} style={{width:"100%",background:"transparent",border:`1.5px solid ${C.gold}`,borderRadius:12,padding:"12px",color:C.gold,fontWeight:800,fontSize:14,cursor:"pointer",marginBottom:10}}>↩ Unsend Bum Request</button>
            :<div style={{display:"flex",gap:8,marginBottom:10}}>
                {BUM_DURATIONS.map(mins=>(
                  <button key={mins} onClick={()=>requestBum(user,mins)} style={{flex:1,background:"linear-gradient(135deg,#FFD700,#FF9A76)",border:"none",borderRadius:12,padding:"12px 6px",color:"#0E0718",fontWeight:800,fontSize:13,cursor:"pointer"}}>🍑 {mins}m · GHS {bumPriceFor(user,mins)}</button>
                ))}
              </div>
        )}
        {!canBum&&<div style={{background:C.bgAlt,borderRadius:12,padding:"12px 14px",border:`1px solid ${C.border}`,textAlign:"center",fontSize:12,color:C.sub,marginBottom:10}}>🔒 Live Bum sessions require <span style={{color:C.gold,fontWeight:700}}>Silver Queen</span> badge or higher</div>}
        {cOk&&(
          <div style={{background:C.greenL,borderRadius:12,padding:"12px 14px",border:`1px solid ${C.green}44`}}>
            <div style={{fontSize:12,color:C.green,fontWeight:700,marginBottom:4}}>✅ Contact Details</div>
            <div style={{fontSize:13,color:C.text}}>📧 {user.contact}</div>
            <div style={{fontSize:13,color:C.text}}>📱 {user.phone}</div>
          </div>
        )}
        {!user.allowDownload&&<div style={{marginTop:10,background:C.redL,borderRadius:10,padding:"8px 12px",border:"1px solid rgba(255,59,92,0.25)",fontSize:11,color:"#FF3B5C",fontWeight:600}}>⬇️ Downloads disabled — this creator has turned off video downloads</div>}
      </div>
    </div>
  );
}

// ── NOTIFICATIONS ──
function NotifScreen({notifs,setNotifs,onClose}) {
  const markAll=()=>{setNotifs(p=>p.map(n=>({...n,read:true})));notifs.filter(n=>!n.read).forEach(n=>api.notifications.markRead(n.id).catch(()=>{}));};
  const markOne=n=>{setNotifs(p=>p.map(x=>x.id===n.id?{...x,read:true}:x));if(!n.read)api.notifications.markRead(n.id).catch(()=>{});};
  // Matches backend notification `type` values (routes/*.js, services/*.js) —
  // not the old mock's generic categories.
  const ic={
    contact_request:"📬",contact_approved:"✅",contact_declined:"📭",
    bum_request:"🍑",bum_approved:"🍑",bum_declined:"📭",bum_extended:"⏱️",
    message:"💬",new_follower:"👥",badge_up:"🎉",badge_down:"📉",payout_issue:"⚠️",
  };
  return (
    <div style={{position:"fixed",inset:0,background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`,zIndex:700,display:"flex",flexDirection:"column",maxWidth:390,margin:"0 auto"}}>
      <div style={{padding:"52px 20px 14px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onClose} style={{background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:12,width:38,height:38,cursor:"pointer",fontSize:18,color:C.text}}>✕</button>
        <div style={{fontFamily:"'Pacifico',cursive",fontSize:20,color:C.text,flex:1}}>Notifications</div>
        <button onClick={markAll} style={{background:"none",border:"none",color:C.pink,fontSize:12,fontWeight:700,cursor:"pointer"}}>Mark all read</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 20px",display:"flex",flexDirection:"column",gap:4}}>
        {notifs.length===0&&<div style={{textAlign:"center",padding:"60px 20px",color:C.sub}}><div style={{fontSize:44,marginBottom:10}}>🔔</div>Nothing yet</div>}
        {notifs.map(n=>(
          <div key={n.id} onClick={()=>markOne(n)} style={{background:C.bgCard,borderRadius:14,padding:"12px 14px",display:"flex",gap:12,alignItems:"flex-start",border:`1px solid ${n.read?C.border:C.borderH}`,cursor:"pointer",marginBottom:2}}>
            <div style={{width:38,height:38,borderRadius:11,background:C.pinkL,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{ic[n.type]||"🔔"}</div>
            <div style={{flex:1}}>
              <span style={{fontSize:13,color:C.text}}>{n.msg}</span>
              <div style={{fontSize:11,color:C.sub,marginTop:3}}>{n.time} ago</div>
            </div>
            {!n.read&&<div style={{width:8,height:8,borderRadius:"50%",background:C.pink,flexShrink:0,marginTop:4}}/>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ADMIN PANEL ──
function AdminPanel({onClose,users,showToast}) {
  const [section,setSection]=useState("overview");
  const [uList,setUList]=useState(users);
  const ranks=["Newcomer","Rising Star","Silver Queen","Gold Queen","Platinum","Diamond"];
  const badgeUp=id=>{setUList(p=>p.map(u=>{if(u.id!==id)return u;const i=ranks.indexOf(u.badge);return{...u,badge:ranks[Math.min(i+1,ranks.length-1)]};}));showToast("Badge upgraded! ✨");};
  const suspend=id=>{setUList(p=>p.map(u=>u.id===id?{...u,suspended:!u.suspended}:u));showToast("User status updated.");};
  const nav=[{id:"overview",icon:"📊",label:"Overview"},{id:"users",icon:"👥",label:"Users"},{id:"bum",icon:"🍑",label:"Live Bum"},{id:"live",icon:"🔴",label:"Live"},{id:"reports",icon:"🚨",label:"Reports"}];
  return (
    <div style={{position:"fixed",inset:0,background:C.bg,zIndex:850,display:"flex",flexDirection:"column",maxWidth:390,margin:"0 auto"}}>
      <div style={{padding:"52px 20px 0",background:"linear-gradient(135deg,#1a0d2e,#0e0718)",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
          <button onClick={onClose} style={{background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:10,width:34,height:34,cursor:"pointer",fontSize:16,color:C.text}}>✕</button>
          <Logo size="sm"/>
          <div style={{marginLeft:"auto",background:"rgba(255,215,0,0.15)",border:`1px solid ${C.gold}44`,borderRadius:10,padding:"5px 12px",fontSize:11,fontWeight:800,color:C.gold}}>⚙ ADMIN</div>
        </div>
        <div style={{display:"flex",gap:6,overflowX:"auto",scrollbarWidth:"none",paddingBottom:14}}>
          {nav.map(n=><button key={n.id} onClick={()=>setSection(n.id)} style={{flexShrink:0,background:section===n.id?"linear-gradient(135deg,#FF3CAC,#A855F7)":C.bgAlt,border:`1px solid ${section===n.id?"transparent":C.border}`,borderRadius:10,padding:"7px 12px",color:section===n.id?"#fff":C.sub,fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>{n.icon} {n.label}</button>)}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
        {section==="overview"&&(
          <div>
            <div style={{fontFamily:"'Pacifico',cursive",fontSize:20,color:C.text,marginBottom:16}}>Dashboard 📊</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
              {[["Total Users","6","👥",C.blue||"#4FC3FF"],["Active Today","4","💃",C.green],["Bum Requests","12","🍑",C.gold],["Live Streams","2","🔴","#FF3B5C"],["ShakyShorts","28","⚡",C.purple],["Reports","3","🚨",C.pink]].map(([l,v,ic,col])=>(
                <div key={l} style={{background:C.bgCard,borderRadius:14,padding:"14px 12px",textAlign:"center",border:`1px solid ${col}33`}}>
                  <div style={{fontSize:22,marginBottom:4}}>{ic}</div>
                  <div style={{fontWeight:800,fontSize:24,color:col}}>{v}</div>
                  <div style={{fontSize:11,color:C.sub,marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{background:C.bgCard,borderRadius:16,padding:"14px 16px",border:`1px solid ${C.border}`}}>
              <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:12}}>Recent Activity</div>
              {[["🍑","Live Bum request: amarabeats → zarawave","2m"],["⚡","5 new ShakyShorts posted","8m"],["🔴","Live started: islandvibe - Dancehall Class","15m"],["🚨","Report filed against a video post","20m"],["💃","3 new videos uploaded","30m"]].map(([ic,msg,t],i)=>(
                <div key={i} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.border}`,alignItems:"center"}}>
                  <span style={{fontSize:16}}>{ic}</span><span style={{flex:1,fontSize:12,color:C.sub}}>{msg}</span><span style={{fontSize:11,color:C.sub}}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {section==="users"&&(
          <div>
            <div style={{fontFamily:"'Pacifico',cursive",fontSize:20,color:C.text,marginBottom:16}}>User Management 👥</div>
            {uList.map(u=>(
              <div key={u.id} style={{background:C.bgCard,borderRadius:16,padding:"14px",border:`1px solid ${u.suspended?"rgba(255,59,92,0.35)":C.border}`,marginBottom:10}}>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                  <VideoAvatar user={u} size={42}/>
                  <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13,color:C.text}}>{u.name}</div><div style={{fontSize:11,color:C.sub}}>@{u.handle} · {u.followers.toLocaleString()} followers</div>{u.suspended&&<div style={{fontSize:10,color:"#FF3B5C",fontWeight:700,marginTop:2}}>⛔ SUSPENDED</div>}</div>
                  <Bdg text={u.badge} color={u.color}/>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>badgeUp(u.id)} style={{flex:1,background:C.goldL,border:`1px solid ${C.gold}44`,borderRadius:10,padding:"7px",color:C.gold,fontWeight:700,fontSize:11,cursor:"pointer"}}>⬆ Badge</button>
                  <button onClick={()=>suspend(u.id)} style={{flex:1,background:u.suspended?C.greenL:C.redL,border:`1px solid ${u.suspended?C.green:"rgba(255,59,92,0.3)"}`,borderRadius:10,padding:"7px",color:u.suspended?C.green:"#FF3B5C",fontWeight:700,fontSize:11,cursor:"pointer"}}>{u.suspended?"✓ Restore":"⛔ Suspend"}</button>
                  <button onClick={()=>showToast(`Viewing ${u.name}'s content`)} style={{flex:1,background:C.purpleL,border:`1px solid ${C.purple}44`,borderRadius:10,padding:"7px",color:C.purple,fontWeight:700,fontSize:11,cursor:"pointer"}}>📋 View</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {section==="bum"&&(
          <div>
            <div style={{fontFamily:"'Pacifico',cursive",fontSize:20,color:C.text,marginBottom:16}}>Live Bum Sessions 🍑</div>
            <div style={{background:C.goldL,borderRadius:14,padding:"14px",border:`1px solid ${C.gold}33`,marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:700,color:C.gold,marginBottom:8}}>Pricing Control</div>
              <div style={{display:"flex",gap:8}}>
                {[["FREE","Current",C.gold],["$2–$20","Planned",C.purple],["70%","Creator Cut",C.green]].map(([v,l,col])=>(
                  <div key={l} style={{flex:1,background:C.bgAlt,borderRadius:10,padding:"10px",textAlign:"center",border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:14,fontWeight:700,color:col}}>{v}</div><div style={{fontSize:10,color:C.sub}}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
            {[{from:"ShakyStar",to:"amarabeats",status:"pending"},{from:"zarawave",to:"salsaqueen",status:"active"},{from:"nanagold",to:"islandvibe",status:"completed"}].map((b,i)=>(
              <div key={i} style={{background:C.bgCard,borderRadius:14,padding:"14px",border:`1px solid ${C.border}`,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><div style={{fontSize:13,fontWeight:700,color:C.text}}>🍑 Live Bum Request</div><Bdg text={b.status.toUpperCase()} color={b.status==="active"?C.green:b.status==="pending"?C.gold:C.sub}/></div>
                <div style={{fontSize:12,color:C.sub,marginBottom:10}}>@{b.from} → @{b.to}</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>showToast("Reviewed")} style={{flex:1,background:C.purpleL,border:`1px solid ${C.purple}44`,borderRadius:10,padding:"7px",color:C.purple,fontWeight:700,fontSize:11,cursor:"pointer"}}>👁 Review</button>
                  <button onClick={()=>showToast("Terminated")} style={{flex:1,background:C.redL,border:"1px solid rgba(255,59,92,0.3)",borderRadius:10,padding:"7px",color:"#FF3B5C",fontWeight:700,fontSize:11,cursor:"pointer"}}>⛔ End</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {section==="live"&&(
          <div>
            <div style={{fontFamily:"'Pacifico',cursive",fontSize:20,color:C.text,marginBottom:16}}>Live Control 🔴</div>
            <div style={{background:C.bgCard,borderRadius:14,padding:"14px",border:"1px solid rgba(255,59,92,0.35)",marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><LiveBadge/><div style={{fontWeight:700,fontSize:14,color:C.text}}>islandvibe — Dancehall Class</div></div>
              <div style={{fontSize:12,color:C.sub,marginBottom:10}}>👁 234 viewers · 18 min live</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>showToast("Watching stream")} style={{flex:1,background:C.purpleL,border:`1px solid ${C.purple}44`,borderRadius:10,padding:"8px",color:C.purple,fontWeight:700,fontSize:12,cursor:"pointer"}}>👁 Watch</button>
                <button onClick={()=>showToast("Stream terminated")} style={{flex:1,background:C.redL,border:"1px solid rgba(255,59,92,0.3)",borderRadius:10,padding:"8px",color:"#FF3B5C",fontWeight:700,fontSize:12,cursor:"pointer"}}>⛔ Terminate</button>
              </div>
            </div>
          </div>
        )}
        {section==="reports"&&(
          <div>
            <div style={{fontFamily:"'Pacifico',cursive",fontSize:20,color:C.text,marginBottom:16}}>Reports 🚨</div>
            {[{type:"Video",reporter:"zarawave",target:"nanagold",reason:"Inappropriate content",sev:"High"},{type:"Short",reporter:"afrogyal",target:"islandvibe",reason:"Harassment",sev:"Medium"},{type:"Live Bum",reporter:"salsaqueen",target:"amarabeats",reason:"Misuse",sev:"Low"}].map((r,i)=>(
              <div key={i} style={{background:C.bgCard,borderRadius:14,padding:"14px",border:"1px solid rgba(255,59,92,0.25)",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><div style={{fontSize:13,fontWeight:700,color:C.text}}>{r.type} Report</div><Bdg text={r.sev} color={r.sev==="High"?"#FF3B5C":r.sev==="Medium"?C.gold:C.sub}/></div>
                <div style={{fontSize:12,color:C.sub,marginBottom:4}}>@{r.reporter} reported @{r.target}</div>
                <div style={{fontSize:12,color:C.text,marginBottom:10}}>"{r.reason}"</div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>showToast("Dismissed")} style={{flex:1,background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"7px",color:C.sub,fontWeight:700,fontSize:11,cursor:"pointer"}}>Dismiss</button>
                  <button onClick={()=>showToast("User warned")} style={{flex:1,background:C.goldL,border:`1px solid ${C.gold}44`,borderRadius:10,padding:"7px",color:C.gold,fontWeight:700,fontSize:11,cursor:"pointer"}}>⚠ Warn</button>
                  <button onClick={()=>showToast("User suspended")} style={{flex:1,background:C.redL,border:"1px solid rgba(255,59,92,0.3)",borderRadius:10,padding:"7px",color:"#FF3B5C",fontWeight:700,fontSize:11,cursor:"pointer"}}>⛔ Suspend</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{height:20}}/>
      </div>
    </div>
  );
}

// ── SHAKYSHORTS SCREEN ──
function ShakyShorts({users,shorts,setShorts,liked,setLiked,showToast,setShowUpload,setProfileUser,openProfile}) {
  const [activeIdx,setActiveIdx]=useState(0);
  const [showUploadShort,setShowUploadShort]=useState(false);
  const [prog,setProg]=useState(0);
  const progRef=useRef(null);
  const short=shorts[activeIdx];
  const user=users.find(u=>u.id===short?.userId)||INIT_USERS[0];

  useEffect(()=>{
    clearInterval(progRef.current);
    setProg(0);
    progRef.current=setInterval(()=>{
      setProg(p=>{
        if(p>=100){clearInterval(progRef.current);setActiveIdx(i=>(i+1)%shorts.length);return 0;}
        return p+(100/(short?.duration||8)*0.1);
      });
    },100);
    return()=>clearInterval(progRef.current);
  },[activeIdx,shorts.length]);

  const toggleLike=async id=>{
    const key=`short_${id}`;
    const was=liked[key];
    setLiked(p=>({...p,[key]:!was}));
    setShorts(p=>p.map(s=>s.id===id?{...s,likes:s.likes+(was?-1:1)}:s));
    try{
      await(was?api.posts.unlike(id):api.posts.like(id));
    }catch(err){
      setLiked(p=>({...p,[key]:was}));
      setShorts(p=>p.map(s=>s.id===id?{...s,likes:s.likes+(was?1:-1)}:s));
      showToast(err?.message||"Couldn't like — try again");
    }
  };

  if(!short)return null;

  return (
    <div style={{position:"relative",height:"calc(100vh - 74px)",overflow:"hidden",background:"#000"}}>
      {/* Progress bars */}
      <div style={{position:"absolute",top:0,left:0,right:0,zIndex:20,display:"flex",gap:3,padding:"10px 14px 0"}}>
        {shorts.map((s,i)=>(
          <div key={s.id} style={{flex:1,height:3,borderRadius:2,background:"rgba(255,255,255,0.25)",overflow:"hidden"}}>
            <div style={{height:"100%",borderRadius:2,background:"#fff",width:i<activeIdx?"100%":i===activeIdx?`${prog}%`:"0%",transition:i===activeIdx?"none":"none"}}/>
          </div>
        ))}
      </div>

      {/* Video area */}
      <div style={{width:"100%",height:"100%",background:short.videoUrl?"#000":`linear-gradient(135deg,${user.color}18,#0e0718)`,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}
        onClick={e=>{const x=e.clientX;const w=e.currentTarget.offsetWidth;if(x<w/3)setActiveIdx(i=>Math.max(0,i-1));else if(x>w*2/3)setActiveIdx(i=>(i+1)%shorts.length);}}>
        {short.videoUrl?(
          <video key={short.id} src={short.videoUrl} autoPlay loop muted playsInline style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        ):(
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:90,marginBottom:8,animation:"wiggle 2.5s ease-in-out infinite"}}>{short.emoji||"💃"}</div>
            <div style={{fontSize:14,color:"rgba(255,255,255,0.6)"}}>Tap left/right to skip</div>
          </div>
        )}
        <VideoWatermark/>

        {/* Top bar */}
        <div style={{position:"absolute",top:28,left:0,right:0,display:"flex",alignItems:"center",gap:10,padding:"0 14px",zIndex:10}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <Logo size="sm"/>
              <span style={{fontSize:11,color:"rgba(255,255,255,0.7)",fontWeight:700,marginLeft:4}}>ShakyShorts ⚡</span>
            </div>
          </div>
          <button onClick={e=>{e.stopPropagation();setShowUploadShort(true);}} style={{background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:10,padding:"7px 12px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>+ Short</button>
        </div>

        {/* User info bottom left */}
        <div style={{position:"absolute",bottom:80,left:14,zIndex:10}} onClick={e=>{e.stopPropagation();}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}} onClick={()=>openProfile(user)}>
            <VideoAvatar user={user} size={44} showVideo/>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:"#fff",cursor:"pointer",textDecoration:"underline",textDecorationColor:"rgba(255,60,172,0.5)"}}>{user.name}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>@{user.handle}</div>
            </div>
          </div>
          <div style={{fontSize:13,color:"#fff",maxWidth:220,lineHeight:1.5,marginBottom:6}}>{short.caption}</div>
          <div style={{display:"flex",gap:6}}>
            <span style={{background:"rgba(255,255,255,0.15)",borderRadius:20,padding:"4px 10px",fontSize:11,color:"#fff"}}>⏱ {short.duration}s</span>
            <span style={{background:"rgba(255,255,255,0.15)",borderRadius:20,padding:"4px 10px",fontSize:11,color:"#fff"}}>👁 {short.views.toLocaleString()}</span>
          </div>
        </div>

        {/* Right actions */}
        <div style={{position:"absolute",bottom:80,right:14,display:"flex",flexDirection:"column",gap:16,alignItems:"center",zIndex:10}} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>toggleLike(short.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer"}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:"rgba(0,0,0,0.4)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,border:liked[`short_${short.id}`]?"1.5px solid #FF3CAC":"1px solid rgba(255,255,255,0.2)"}}>{liked[`short_${short.id}`]?"❤️":"🤍"}</div>
            <span style={{fontSize:11,color:"#fff",fontWeight:600}}>{short.likes}</span>
          </button>
          <button onClick={()=>showToast("Comment feature coming soon 💬")} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer"}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:"rgba(0,0,0,0.4)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,border:"1px solid rgba(255,255,255,0.2)"}}>💬</div>
            <span style={{fontSize:11,color:"#fff",fontWeight:600}}>Reply</span>
          </button>
          <button onClick={()=>showToast("Short shared! 🔗")} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer"}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:"rgba(0,0,0,0.4)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,border:"1px solid rgba(255,255,255,0.2)"}}>↗</div>
            <span style={{fontSize:11,color:"#fff",fontWeight:600}}>Share</span>
          </button>
          {user.allowDownload?(
            <button onClick={()=>showToast("Video saved with Shakybum watermark ⬇️🍑")} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer"}}>
              <div style={{width:44,height:44,borderRadius:"50%",background:"rgba(0,0,0,0.4)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,border:"1px solid rgba(255,255,255,0.2)"}}>⬇️</div>
              <span style={{fontSize:11,color:"#fff",fontWeight:600}}>Save</span>
            </button>
          ):(
            <button onClick={()=>showToast("⬇️ This creator has disabled downloads")} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",opacity:.5}}>
              <div style={{width:44,height:44,borderRadius:"50%",background:"rgba(0,0,0,0.4)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,border:"1px solid rgba(255,255,255,0.15)"}}>🚫</div>
              <span style={{fontSize:10,color:"rgba(255,255,255,0.5)"}}>No DL</span>
            </button>
          )}
        </div>
      </div>

      {/* Upload short modal */}
      {showUploadShort&&(
        <div style={{position:"absolute",inset:0,background:"rgba(5,0,14,0.97)",zIndex:30,display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
          <div style={{padding:"20px 20px 14px",display:"flex",alignItems:"center",gap:12}}>
            <button onClick={()=>setShowUploadShort(false)} style={{background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:12,width:38,height:38,cursor:"pointer",fontSize:18,color:C.text}}>✕</button>
            <div style={{fontFamily:"'Pacifico',cursive",fontSize:18,color:C.text}}>New ShakyShort ⚡</div>
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 24px",gap:14}}>
            <div style={{fontSize:60}}>⚡</div>
            <div style={{fontFamily:"'Pacifico',cursive",fontSize:20,color:C.text,textAlign:"center"}}>Post a ShakyShort</div>
            <div style={{fontSize:13,color:C.sub,textAlign:"center",lineHeight:1.7,maxWidth:280}}>Short looping dance clips up to 15 seconds. They appear in the ShakyShorts feed and disappear after 24 hours. You can also pin them to your profile!</div>
            <div style={{background:C.bgCard,borderRadius:14,padding:"14px",border:`1px solid ${C.borderH}`,width:"100%"}}>
              <div style={{fontSize:12,fontWeight:700,color:C.pink,marginBottom:6}}>🍑 Watermark Notice</div>
              <div style={{fontSize:12,color:C.sub}}>All ShakyShorts carry the Shakybum brand watermark. This protects both you and the platform.</div>
            </div>
            <button onClick={()=>{setShowUploadShort(false);setShowUpload("short");}} style={{width:"100%",background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:16,padding:"14px",color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
              <span style={{fontSize:20}}>📹</span> Record or Upload (max 15s)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── HOME TAB ──
function HomeTab({liked,setLiked,posts,setPosts,shorts,users,following,setFollowing,setActiveTab,showToast,setProfileUser,setShowLive,setShowUpload,notifs,setShowNotifs,openProfile}) {
  const [commenting,setCommenting]=useState(null);
  const [cText,setCText]=useState("");
  const unread=notifs.filter(n=>!n.read).length;
  const toggleLike=async id=>{
    const was=liked[id];
    setLiked(p=>({...p,[id]:!was})); // optimistic
    setPosts(p=>p.map(po=>po.id===id?{...po,likes:po.likes+(was?-1:1)}:po));
    try{
      await(was?api.posts.unlike(id):api.posts.like(id));
    }catch(err){
      // revert on failure — better than silently leaving the UI wrong
      setLiked(p=>({...p,[id]:was}));
      setPosts(p=>p.map(po=>po.id===id?{...po,likes:po.likes+(was?1:-1)}:po));
      showToast(err?.message||"Couldn't like — try again");
    }
  };
  const expandComments=async pid=>{
    const opening=commenting!==pid;
    setCommenting(opening?pid:null);
    if(!opening)return;
    try{
      const{comments}=await api.posts.comments(pid);
      setPosts(p=>p.map(po=>po.id===pid?{...po,comments:comments.map(c=>c.text)}:po));
    }catch(err){
      showToast(err?.message||"Couldn't load comments");
    }
  };
  const postComment=async pid=>{
    if(!cText.trim())return;
    const flag=scanContactInfo(cText);
    if(flag.flagged){showToast(`🚫 Comment can't include ${flag.reason}. Repeated attempts get you permanently banned — use paid Contact requests instead`);return;}
    const text=cText.trim();
    setCText("");
    try{
      await api.posts.comment(pid,text);
      setPosts(p=>p.map(po=>po.id===pid?{...po,comments:[...po.comments,text],commentsCount:(po.commentsCount??po.comments.length)+1}:po));
      showToast("Comment posted! 💬");
    }catch(err){
      showToast(err?.message||"Couldn't post comment — try again");
    }
  };
  return (
    <div>
      <div style={{padding:"52px 20px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <Logo size="md"/>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setShowLive(true)} style={{background:"rgba(255,59,92,0.15)",border:"1px solid rgba(255,59,92,0.35)",borderRadius:12,padding:"7px 12px",cursor:"pointer",fontSize:11,fontWeight:800,color:"#FF3B5C",display:"flex",alignItems:"center",gap:4}}><span className="live-flash">●</span>LIVE</button>
          <button onClick={()=>setShowUpload("post")} style={{background:C.pinkL,border:`1px solid ${C.borderH}`,borderRadius:12,width:38,height:38,cursor:"pointer",fontSize:18}}>➕</button>
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowNotifs(true)} style={{background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:12,width:38,height:38,cursor:"pointer",fontSize:16}}>🔔</button>
            {unread>0&&<div style={{position:"absolute",top:6,right:6,width:8,height:8,borderRadius:"50%",background:C.pink,border:`2px solid ${C.bg}`}}/>}
          </div>
        </div>
      </div>

      {/* ShakyShorts strip */}
      <div style={{margin:"14px 0 0",paddingLeft:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <span style={{fontSize:13,fontWeight:700,color:C.text}}>⚡ ShakyShorts</span>
          <span style={{fontSize:11,color:C.sub}}>· tap to watch</span>
          <button onClick={()=>setActiveTab(2)} style={{marginLeft:"auto",marginRight:20,background:"none",border:"none",color:C.pink,fontSize:12,fontWeight:700,cursor:"pointer"}}>See all →</button>
        </div>
        <div style={{display:"flex",gap:12,overflowX:"auto",paddingRight:20,scrollbarWidth:"none",paddingBottom:4}}>
          <div onClick={()=>setShowUpload("short")} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,flexShrink:0,cursor:"pointer"}}>
            <div style={{width:60,height:80,borderRadius:14,background:"linear-gradient(135deg,#FF3CAC,#A855F7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,border:`2px solid ${C.bg}`}}>➕</div>
            <div style={{fontSize:10,color:C.sub}}>Add Short</div>
          </div>
          {shorts.slice(0,10).map(s=>{
            const u=users.find(x=>x.id===s.userId)||INIT_USERS[0];
            return (
              <div key={s.id} onClick={()=>setActiveTab(2)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,flexShrink:0,cursor:"pointer"}}>
                <div style={{width:60,height:80,borderRadius:14,background:`linear-gradient(135deg,${u.color}20,${u.color}08)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,position:"relative",border:`2px solid ${u.color}55`,overflow:"hidden"}}>
                  {s.videoUrl?<video src={s.videoUrl} muted playsInline style={{width:"100%",height:"100%",objectFit:"cover"}}/>:(s.emoji||"💃")}
                  <div style={{position:"absolute",bottom:4,left:0,right:0,height:3,background:"rgba(255,255,255,0.15)",margin:"0 4px",borderRadius:2}}>
                    <div style={{width:"60%",height:"100%",background:u.color,borderRadius:2}}/>
                  </div>
                </div>
                <div style={{fontSize:9,color:C.sub,maxWidth:60,textAlign:"center",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{u.handle}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hero */}
      <div style={{margin:"14px 20px",borderRadius:22,background:"linear-gradient(135deg,#FF3CAC,#A855F7)",padding:"20px 20px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",right:-18,top:-18,fontSize:110,opacity:.09}}>🌀</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.75)",fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>🔥 Trending Challenge</div>
        <div style={{fontFamily:"'Pacifico',cursive",fontSize:22,color:"#fff",marginBottom:4,lineHeight:1.3}}>Waist Wine<br/>Challenge</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.75)",marginBottom:14}}>834 women joined today</div>
        <button onClick={()=>setActiveTab(5)} style={{background:"rgba(255,255,255,0.2)",backdropFilter:"blur(10px)",border:"1.5px solid rgba(255,255,255,0.5)",borderRadius:22,padding:"9px 22px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Join Now →</button>
      </div>

      {/* Stories row */}
      <div style={{paddingLeft:20,marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:10}}>Live Today 🎯</div>
        <div style={{display:"flex",gap:14,overflowX:"auto",paddingRight:20,scrollbarWidth:"none"}}>
          <div onClick={()=>setShowUpload("post")} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,flexShrink:0,cursor:"pointer"}}>
            <div style={{width:52,height:52,borderRadius:"50%",background:"linear-gradient(135deg,#FF3CAC,#A855F7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,border:`2px solid ${C.bg}`}}>➕</div>
            <div style={{fontSize:10,color:C.sub}}>Post</div>
          </div>
          {users.map(u=>(
            <div key={u.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,flexShrink:0}}>
              <div style={{padding:2.5,borderRadius:"50%",background:u.online?"linear-gradient(135deg,#00E5A0,#00B37E)":"linear-gradient(135deg,#FF3CAC,#A855F7)"}}>
                <div style={{background:C.bg,borderRadius:"50%",padding:2}}>
                  <VideoAvatar user={u} size={44} isLive={u.id===5} onClick={()=>setProfileUser(u)} showVideo/>
                </div>
              </div>
              <div onClick={()=>openProfile(u)} style={{fontSize:10,color:C.sub,maxWidth:52,textAlign:"center",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",cursor:"pointer"}}>{u.handle}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:14}}>
        <div style={{fontSize:13,fontWeight:700,color:C.text}}>For You 💫</div>
        {posts.map(post=>{
          const user=users.find(u=>u.id===post.userId)||INIT_USERS[0];
          const isF=following.includes(user.id);
          return (
            <Card key={post.id}>
              <div style={{padding:"14px 16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                  <VideoAvatar user={user} size={38} onClick={()=>setProfileUser(user)} showVideo/>
                  <div onClick={()=>openProfile(user)} style={{flex:1,minWidth:0,cursor:"pointer"}}>
                    <div style={{fontWeight:700,fontSize:14,color:C.text,textDecoration:"underline",textDecorationColor:"rgba(255,60,172,0.35)"}}>{user.name}</div>
                    <div style={{fontSize:11,color:C.sub}}>@{user.handle} · {post.timeAgo} ago</div>
                  </div>
                  <button onClick={()=>{const f=!isF;setFollowing(p=>f?[...p,user.id]:p.filter(x=>x!==user.id));showToast(f?`Following ${user.name}! 👯`:"Unfollowed");}} style={{background:isF?C.purpleL:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:isF?`1px solid ${C.purple}`:"none",borderRadius:10,padding:"6px 12px",color:isF?C.purple:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",flexShrink:0}}>{isF?"✓ Following":"+ Follow"}</button>
                </div>
                <div style={{borderRadius:14,overflow:"hidden",background:`linear-gradient(135deg,${user.color}18,${user.color}06)`,height:155,display:"flex",alignItems:"center",justifyContent:"center",fontSize:60,marginBottom:12,border:`1px solid ${user.color}20`,position:"relative"}}>
                  {post.videoUrl?<video src={post.videoUrl} controls playsInline style={{width:"100%",height:"100%",objectFit:"cover"}}/>:(MOVES.find(m=>m.name===post.move)?.emoji||"💃")}
                  {post.move&&<div style={{position:"absolute",bottom:8,left:10,pointerEvents:"none"}}><Bdg text={post.move} color={user.color}/></div>}
                  {!post.videoUrl&&<div style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,0.5)",borderRadius:8,padding:"3px 8px",fontSize:10,color:"#fff"}}>🎬 Video</div>}
                  <VideoWatermark/>
                </div>
                <div style={{fontSize:13,color:C.text,marginBottom:10}}>{post.caption}</div>
                <div style={{display:"flex",gap:14,alignItems:"center"}}>
                  <button onClick={()=>toggleLike(post.id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontSize:13,color:liked[post.id]?C.pink:C.sub}}>{liked[post.id]?"❤️":"🤍"} {post.likes}</button>
                  <button onClick={()=>expandComments(post.id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontSize:13,color:commenting===post.id?C.purple:C.sub}}>💬 {post.commentsCount??post.comments.length}</button>
                  {user.allowDownload
                    ?<button onClick={()=>showToast("Video saved with Shakybum watermark 🍑⬇️")} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:C.sub,marginLeft:"auto"}}>⬇️ Save</button>
                    :<button onClick={()=>showToast("⬇️ Downloads disabled by creator")} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:C.sub,opacity:.5,marginLeft:"auto"}}>🚫 Save</button>
                  }
                </div>
                {commenting===post.id&&(
                  <div style={{marginTop:12}}>
                    <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8,maxHeight:76,overflowY:"auto"}}>
                      {post.comments.map((c,i)=><div key={i} style={{fontSize:12,color:C.sub,background:C.bgAlt,borderRadius:8,padding:"5px 10px"}}>{c}</div>)}
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <input value={cText} onChange={e=>setCText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&postComment(post.id)} placeholder="Write a comment..." style={{flex:1,background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px",fontSize:13,color:C.text,outline:"none"}}/>
                      <button onClick={()=>postComment(post.id)} style={{background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:10,padding:"8px 14px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Post</button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <div style={{height:20}}/>
    </div>
  );
}

// ── EXPLORE TAB ──
function ExploreTab({liked,setLiked,following,setFollowing,showToast,setProfileUser,openProfile}) {
  const [cat,setCat]=useState("All");
  const [q,setQ]=useState("");
  const filtered=MOVES.filter(m=>(cat==="All"||m.cat===cat)&&(!q||m.name.toLowerCase().includes(q.toLowerCase())));
  const toggle=id=>setLiked(p=>({...p,[id]:!p[id]}));
  return (
    <div>
      <div style={{padding:"52px 20px 16px"}}>
        <div style={{fontFamily:"'Pacifico',cursive",fontSize:24,color:C.text,marginBottom:14}}>Explore 🔍</div>
        <div style={{background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:14,padding:"10px 16px",display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
          <span>🔎</span>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search moves, styles..." style={{background:"none",border:"none",outline:"none",fontSize:14,color:C.text,flex:1}}/>
          {q&&<button onClick={()=>setQ("")} style={{background:"none",border:"none",cursor:"pointer",color:C.sub,fontSize:16}}>✕</button>}
        </div>
        <div style={{display:"flex",gap:8,overflowX:"auto",scrollbarWidth:"none",paddingBottom:4}}>
          {CATS.map(c=><button key={c} onClick={()=>setCat(c)} style={{flexShrink:0,border:cat===c?"none":`1px solid ${C.border}`,borderRadius:20,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer",background:cat===c?"linear-gradient(135deg,#FF3CAC,#A855F7)":C.bgAlt,color:cat===c?"#fff":C.sub}}>{c}</button>)}
        </div>
      </div>
      <div style={{padding:"0 20px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,paddingBottom:20}}>
        {filtered.length===0&&<div style={{gridColumn:"1/-1",textAlign:"center",color:C.sub,padding:"32px 0"}}>No moves found 🔍</div>}
        {filtered.map(move=>{
          const isF=following.includes(move.creator.id);
          return (
            <Card key={move.id}>
              <div style={{background:`linear-gradient(135deg,${move.creator.color}20,${move.creator.color}06)`,padding:"22px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:8,fontSize:44,position:"relative"}}>
                {move.emoji}<Bdg text={move.level} color={move.creator.color}/>
                <div style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,0.4)",borderRadius:6,padding:"2px 6px",fontSize:9,color:"rgba(255,255,255,0.8)"}}>🎬</div>
              </div>
              <div style={{padding:"10px 12px 12px"}}>
                <div style={{fontWeight:700,fontSize:13,color:C.text,marginBottom:2}}>{move.name}</div>
                <div style={{fontSize:11,color:C.sub,marginBottom:6}}>{move.cat}</div>
                <div onClick={()=>openProfile(move.creator)} style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,cursor:"pointer"}}>
                  <VideoAvatar user={move.creator} size={20} showVideo/><span style={{fontSize:11,color:C.sub,textDecoration:"underline",textDecorationColor:"rgba(168,85,247,0.4)"}}>{move.creator.handle}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <button onClick={()=>toggle(move.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:liked[move.id]?C.pink:C.sub}}>{liked[move.id]?"❤️":"🤍"} {(move.likes+(liked[move.id]?1:0)).toLocaleString()}</button>
                  <button onClick={()=>{const f=!isF;setFollowing(p=>f?[...p,move.creator.id]:p.filter(x=>x!==move.creator.id));showToast(f?`Following ${move.creator.name}!`:"Unfollowed");}} style={{background:isF?"transparent":"linear-gradient(135deg,#FF3CAC,#A855F7)",border:isF?`1px solid ${C.purple}`:"none",borderRadius:8,padding:"4px 10px",color:isF?C.purple:"#fff",fontWeight:700,fontSize:10,cursor:"pointer"}}>{isF?"✓":"+ Follow"}</button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── COMMUNITY TAB ──
function CommunityTab({users,following,setFollowing,contactRequests,approvedContacts,bumRequests,approvedBum,showToast,setProfileUser,openProfile,requestContact,requestBum,startBumSession,approveContact,declineContact,approveBumReq,declineBumReq}) {
  const [view,setView]=useState("discover");
  const [durPickerFor,setDurPickerFor]=useState(null); // uid whose 15/30-min picker is expanded in the Discover card
  const incoming=contactRequests.received||[];
  const incomingBum=bumRequests.received||[];
  const approve=uid=>approveContact(uid);
  const deny=uid=>declineContact(uid);
  // Neither contact-requests nor Bum-session bookings can be cancelled by the
  // payer once submitted — the backend only exposes approve/decline to the
  // CREATOR (see backend/src/routes/contact.routes.js, bum.routes.js). A
  // held payment stays held until the other side decides; that's a
  // deliberate design, not a missing feature, so this is honest messaging
  // rather than a fake "unsend" that doesn't touch the real held payment.
  const unsendContact=()=>showToast("Payment is held until they respond — it can't be cancelled from your side.");
  const unsendBum=()=>showToast("Payment is held until they respond — it can't be cancelled from your side.");
  const approveBum=req=>approveBumReq(req._backendId);
  const denyBum=req=>declineBumReq(req._backendId);

  return (
    <div>
      <div style={{padding:"52px 20px 16px"}}>
        <div style={{fontFamily:"'Pacifico',cursive",fontSize:24,color:C.text,marginBottom:4}}>Community 👯</div>
        <div style={{fontSize:13,color:C.sub,marginBottom:14}}>Connect safely — contacts hidden until approved 🔒</div>
        <div style={{display:"flex",gap:6}}>
          {[["discover","Discover"],["requests",`Requests${incoming.length?` (${incoming.length})`:""}`],["bum",`🍑 Live Bum${incomingBum.length?` (${incomingBum.length})`:""}`],["approved","Approved"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{flex:1,padding:"8px 3px",borderRadius:12,border:view===v?"none":`1px solid ${C.border}`,background:view===v?"linear-gradient(135deg,#FF3CAC,#A855F7)":C.bgAlt,color:view===v?"#fff":C.sub,fontSize:10,fontWeight:700,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:12}}>
        {view==="discover"&&users.map(u=>{
          const sent=(contactRequests.sent||[]).includes(u.id),ok=approvedContacts.includes(u.id),isF=following.includes(u.id),bSent=(bumRequests.sent||[]).some(r=>r.id===u.id),canBum=BUM_OK.includes(u.badge)&&u.bumEnabled;
          return (
            <Card key={u.id} style={{padding:"16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                <VideoAvatar user={u} size={52} isLive={u.id===5} onClick={()=>setProfileUser(u)} showVideo/>
                <div style={{flex:1,minWidth:0}}>
                  <div onClick={()=>openProfile(u)} style={{fontWeight:700,fontSize:14,color:C.text,cursor:"pointer",textDecoration:"underline",textDecorationColor:"rgba(255,60,172,0.35)"}}>{u.name}</div>
                  <div style={{fontSize:12,color:C.sub}}>@{u.handle}</div>
                  <div style={{display:"flex",gap:4,marginTop:4,flexWrap:"wrap"}}><Bdg text={u.badge} color={u.color}/>{canBum&&<BumBadge/>}{u.online&&<span style={{fontSize:10,color:C.green,fontWeight:700}}>● Online</span>}</div>
                </div>
                <button onClick={()=>{const f=!isF;setFollowing(p=>f?[...p,u.id]:p.filter(x=>x!==u.id));showToast(f?`Following ${u.name}!`:"Unfollowed");}} style={{background:isF?"transparent":"linear-gradient(135deg,#FF3CAC,#A855F7)",border:isF?`1px solid ${C.purple}`:"none",borderRadius:10,padding:"7px 12px",color:isF?C.purple:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",flexShrink:0}}>{isF?"✓":"+ Follow"}</button>
              </div>
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <div style={{flex:1,background:C.bgAlt,borderRadius:10,padding:"7px",textAlign:"center",fontSize:11,color:C.sub}}><b style={{color:C.text}}>{u.followers.toLocaleString()}</b> followers</div>
                <div style={{flex:1,background:C.bgAlt,borderRadius:10,padding:"7px",textAlign:"center",fontSize:11,color:C.sub}}><b style={{color:C.text}}>{u.moves}</b> moves</div>
              </div>
              <div style={{display:"flex",gap:8}}>
                {ok
                  ?<div style={{flex:1,background:C.greenL,border:`1px solid ${C.green}44`,borderRadius:10,padding:"9px",color:C.green,fontWeight:700,fontSize:11,textAlign:"center"}}>✅ Contact Approved</div>
                  :sent
                    ?<button onClick={()=>unsendContact(u.id)} style={{flex:1,background:"transparent",border:`1px solid ${C.peach}`,borderRadius:10,padding:"9px",color:C.peach,fontWeight:700,fontSize:11,cursor:"pointer"}}>↩ Unsend Contact</button>
                    :<button onClick={()=>requestContact(u)} style={{flex:1,background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px",color:C.sub,fontWeight:700,fontSize:11,cursor:"pointer"}}>💳 Contact · GHS {priceFor(u)}</button>
                }
                {canBum&&(
                  bSent
                    ?<button onClick={()=>unsendBum(u.id)} style={{flex:1,background:"transparent",border:`1px solid ${C.gold}`,borderRadius:10,padding:"9px",color:C.gold,fontWeight:700,fontSize:11,cursor:"pointer"}}>↩ Unsend Bum</button>
                    :durPickerFor===u.id
                      ?<div style={{flex:1,display:"flex",gap:6}}>
                          {BUM_DURATIONS.map(mins=>(
                            <button key={mins} onClick={()=>{requestBum(u,mins);setDurPickerFor(null);}} style={{flex:1,background:"linear-gradient(135deg,#FFD700cc,#FF9A76cc)",border:"none",borderRadius:10,padding:"9px 2px",color:"#0E0718",fontWeight:800,fontSize:11,cursor:"pointer"}}>{mins}m·GHS{bumPriceFor(u,mins)}</button>
                          ))}
                        </div>
                      :<button onClick={()=>setDurPickerFor(u.id)} style={{flex:1,background:"linear-gradient(135deg,#FFD700cc,#FF9A76cc)",border:"none",borderRadius:10,padding:"9px",color:"#0E0718",fontWeight:800,fontSize:12,cursor:"pointer"}}>🍑 Live Bum · from GHS {bumPriceFor(u,BUM_DURATIONS[0])}</button>
                )}
              </div>
              {!u.allowDownload&&<div style={{marginTop:8,background:C.redL,borderRadius:8,padding:"6px 10px",fontSize:10,color:"#FF3B5C"}}>⬇️ Downloads disabled by this creator</div>}
            </Card>
          );
        })}

        {view==="requests"&&(
          <>
            {incoming.length===0?<div style={{textAlign:"center",padding:"40px 0",color:C.sub}}>No pending requests 🎉</div>
            :incoming.map(uid=>{const u=users.find(x=>x.id===uid);if(!u)return null;return(
              <Card key={uid} style={{padding:"16px"}}>
                <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:12}}><VideoAvatar user={u} size={46} onClick={()=>setProfileUser(u)} showVideo/><div><div onClick={()=>openProfile(u)} style={{fontWeight:700,color:C.text,cursor:"pointer",textDecoration:"underline",textDecorationColor:"rgba(255,60,172,0.35)"}}>{u.name}</div><div style={{fontSize:12,color:C.sub}}>@{u.handle}</div></div></div>
                <div style={{background:"rgba(255,215,0,0.08)",borderRadius:12,padding:"10px 14px",fontSize:12,color:"#C8A600",marginBottom:12,border:"1px solid rgba(255,215,0,0.2)"}}><b>{u.name}</b> wants to see your contact details. Only approve people you trust!</div>
                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>deny(uid)} style={{flex:1,background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px",color:C.sub,fontWeight:700,fontSize:13,cursor:"pointer"}}>✕ Decline</button>
                  <button onClick={()=>approve(uid)} style={{flex:2,background:"linear-gradient(135deg,#00E5A0,#00B37E)",border:"none",borderRadius:12,padding:"10px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>✓ Approve</button>
                </div>
              </Card>
            );})}
            {(contactRequests.sent||[]).length>0&&(
              <div style={{marginTop:8}}>
                <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Sent Requests</div>
                {(contactRequests.sent||[]).map(uid=>{const u=users.find(x=>x.id===uid);if(!u)return null;return(
                  <Card key={uid} style={{padding:"14px 16px",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <VideoAvatar user={u} size={38} showVideo/>
                      <div style={{flex:1}}><div onClick={()=>openProfile(u)} style={{fontWeight:600,color:C.text,cursor:"pointer"}}>{u.name}</div><div style={{fontSize:12,color:C.peach}}>⏳ Awaiting approval</div></div>
                      <button onClick={()=>unsendContact(uid)} style={{background:"transparent",border:`1px solid ${C.peach}`,borderRadius:10,padding:"6px 12px",color:C.peach,fontWeight:700,fontSize:11,cursor:"pointer"}}>↩ Unsend</button>
                    </div>
                  </Card>
                );})}
              </div>
            )}
          </>
        )}

        {view==="bum"&&(
          <>
            <div style={{background:C.goldL,borderRadius:16,padding:"14px 18px",border:`1px solid ${C.gold}30`,marginBottom:4}}>
              <div style={{fontSize:13,fontWeight:700,color:C.gold,marginBottom:4}}>🍑 Live Bum Sessions</div>
              <div style={{fontSize:12,color:C.sub,lineHeight:1.65}}>Billed by duration ({BUM_DURATIONS.join("/")}min blocks). Payment is held until you confirm — you keep {Math.round((1-PLATFORM_CUT)*100)}% of every session. <b style={{color:C.gold}}>Silver Queen+</b> badge required.</div>
            </div>

            {incomingBum.length>0&&<>
              <div style={{fontSize:12,fontWeight:700,color:C.sub,margin:"14px 0 10px",textTransform:"uppercase",letterSpacing:1}}>Incoming ({incomingBum.length})</div>
              {incomingBum.map(req=>{const u=users.find(x=>x.id===req.id);if(!u)return null;const amt=bumPriceFor(ME,req.mins);return(
                <Card key={req.id} style={{padding:"16px",border:`1px solid ${C.gold}55`,marginBottom:10}}>
                  <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:10}}><VideoAvatar user={u} size={46} onClick={()=>setProfileUser(u)} showVideo/><div onClick={()=>openProfile(u)} style={{cursor:"pointer"}}><div style={{fontWeight:700,color:C.text}}>{u.name}</div><div style={{fontSize:12,color:C.sub}}>wants a {req.mins}-min session</div></div></div>
                  <div style={{background:C.bgAlt,borderRadius:10,padding:"10px 12px",marginBottom:12,border:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.sub,marginBottom:3}}><span>{req.mins} min · GHS {bumRateFor(ME).toFixed(2)}/min</span><span style={{color:C.text,fontWeight:700}}>GHS {amt.toFixed(2)}</span></div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.sub,marginBottom:3}}><span>Platform fee ({Math.round(PLATFORM_CUT*100)}%)</span><span>− GHS {(amt-creatorCut(amt)).toFixed(2)}</span></div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:13,fontWeight:800,color:C.green,paddingTop:6,marginTop:3,borderTop:`1px solid ${C.border}`}}><span>You receive</span><span>GHS {creatorCut(amt).toFixed(2)}</span></div>
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>denyBum(req)} style={{flex:1,background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px",color:C.sub,fontWeight:700,fontSize:13,cursor:"pointer"}}>✕ Decline</button>
                    <button onClick={()=>approveBum(req)} style={{flex:2,background:"linear-gradient(135deg,#FFD700,#FF9A76)",border:"none",borderRadius:12,padding:"10px",color:"#0E0718",fontWeight:800,fontSize:13,cursor:"pointer"}}>✓ Confirm Session</button>
                  </div>
                </Card>
              );})}
            </>}

            <div style={{fontSize:12,fontWeight:700,color:C.sub,margin:"14px 0 10px",textTransform:"uppercase",letterSpacing:1}}>Your Requests</div>
            {(bumRequests.sent||[]).length===0?<div style={{textAlign:"center",padding:"32px 0",color:C.sub}}><div style={{fontSize:44,marginBottom:10}}>🍑</div><div style={{fontWeight:700,color:C.text}}>No bum requests yet</div><div style={{fontSize:13,marginTop:4}}>Find eligible creators in Discover</div></div>
            :(bumRequests.sent||[]).map(req=>{const u=users.find(x=>x.id===req.id);if(!u)return null;return(
              <Card key={req.id} style={{padding:"16px"}}>
                <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:10}}><VideoAvatar user={u} size={46} showVideo onClick={()=>setProfileUser(u)}/><div onClick={()=>openProfile(u)} style={{cursor:"pointer"}}><div style={{fontWeight:700,color:C.text}}>{u.name}</div><div style={{fontSize:12,color:C.sub}}>{u.badge} · {u.moves} moves</div></div><div style={{marginLeft:"auto"}}><BumBadge/></div></div>
                <div style={{background:"rgba(255,215,0,0.08)",borderRadius:10,padding:"9px 12px",fontSize:12,color:C.peach,fontWeight:600,border:`1px solid ${C.gold}22`,marginBottom:10}}>🔒 {req.mins} min · GHS {bumPriceFor(u,req.mins)} held — awaiting {u.name}'s confirmation...</div>
                <button onClick={()=>unsendBum(req.id)} style={{width:"100%",background:"transparent",border:`1.5px solid ${C.gold}`,borderRadius:10,padding:"9px",color:C.gold,fontWeight:700,fontSize:12,cursor:"pointer"}}>↩ Unsend Bum Request</button>
              </Card>
            );})}

            {(approvedBum||[]).length>0&&<>
              <div style={{fontSize:12,fontWeight:700,color:C.sub,margin:"16px 0 10px",textTransform:"uppercase",letterSpacing:1}}>Confirmed Sessions</div>
              {(approvedBum||[]).map(sess=>{const u=users.find(x=>x.id===sess.id);if(!u)return null;return(
                <Card key={sess.id} style={{padding:"14px 16px",marginBottom:8,border:`1px solid ${C.green}44`}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <VideoAvatar user={u} size={38} showVideo/>
                    <div style={{flex:1}}><div style={{fontWeight:600,color:C.text}}>{u.name}</div><div style={{fontSize:11,color:C.green}}>✅ Confirmed · {sess.mins} min</div></div>
                    <button onClick={()=>startBumSession(sess)} style={{background:"linear-gradient(135deg,#FFD700,#FF9A76)",border:"none",borderRadius:10,padding:"8px 14px",color:"#0E0718",fontWeight:800,fontSize:12,cursor:"pointer"}}>▶ Start</button>
                  </div>
                </Card>
              );})}
            </>}
          </>
        )}

        {view==="approved"&&(
          approvedContacts.length===0?<div style={{textAlign:"center",padding:"40px 20px",color:C.sub}}><div style={{fontSize:44,marginBottom:10}}>🔒</div><div style={{fontWeight:700,color:C.text}}>No approved contacts yet</div></div>
          :approvedContacts.map(uid=>{const u=users.find(x=>x.id===uid);if(!u)return null;return(
            <Card key={uid} style={{padding:"16px"}}>
              <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:12}}><VideoAvatar user={u} size={46} showVideo onClick={()=>setProfileUser(u)}/><div style={{flex:1}}><div onClick={()=>openProfile(u)} style={{fontWeight:700,color:C.text,cursor:"pointer"}}>{u.name}</div><div style={{fontSize:11,color:C.sub}}>@{u.handle}</div></div><div style={{background:C.greenL,borderRadius:10,padding:"4px 10px",fontSize:11,fontWeight:700,color:C.green}}>✅</div></div>
              <div style={{background:C.greenL,borderRadius:12,padding:"12px 14px",border:`1px solid ${C.green}44`}}>
                <div style={{fontSize:13,color:C.text,marginBottom:4}}>📧 {u.contact}</div>
                <div style={{fontSize:13,color:C.text}}>📱 {u.phone}</div>
              </div>
            </Card>
          );})
        )}
      </div>
      <div style={{height:20}}/>
    </div>
  );
}

// ── LEARN TAB ──
function LearnTab({showToast,openProfile}) {
  const [lvl,setLvl]=useState("All");
  const lc={Beginner:C.green,Intermediate:C.peach,Advanced:C.pink};
  const filtered=lvl==="All"?TUTORIALS:TUTORIALS.filter(t=>t.level===lvl);
  return (
    <div>
      <div style={{padding:"52px 20px 16px"}}>
        <div style={{fontFamily:"'Pacifico',cursive",fontSize:24,color:C.text,marginBottom:4}}>Learn & Grow 📚</div>
        <div style={{fontSize:13,color:C.sub,marginBottom:14}}>Master every waist move, step by step</div>
        <div style={{background:C.bgCard,borderRadius:18,padding:"14px 18px",marginBottom:14,display:"flex",gap:12,alignItems:"center",border:`1px solid ${C.purple}44`}}>
          <div style={{fontSize:30}}>🤖</div>
          <div style={{flex:1}}><div style={{fontSize:12,color:C.purple,fontWeight:700,marginBottom:2}}>AI Move Coach</div><div style={{fontSize:12,color:C.sub}}>Record yourself & get instant AI feedback on technique</div></div>
          <button onClick={()=>showToast("AI Coach launching soon! 🤖")} style={{background:"linear-gradient(135deg,#A855F7,#FF3CAC)",border:"none",borderRadius:10,padding:"7px 12px",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",flexShrink:0}}>Try</button>
        </div>
        <div style={{display:"flex",gap:8,overflowX:"auto",scrollbarWidth:"none"}}>
          {["All","Beginner","Intermediate","Advanced"].map(l=><button key={l} onClick={()=>setLvl(l)} style={{flexShrink:0,border:lvl===l?"none":`1px solid ${C.border}`,borderRadius:20,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer",background:lvl===l?"linear-gradient(135deg,#FF3CAC,#A855F7)":C.bgAlt,color:lvl===l?"#fff":C.sub}}>{l}</button>)}
        </div>
      </div>
      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:14}}>
        {filtered.map(t=>(
          <Card key={t.id} style={{overflow:"hidden"}}>
            <div style={{background:`linear-gradient(135deg,${t.creator.color}20,${t.creator.color}06)`,padding:"28px 0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:54,position:"relative"}}>
              {t.emoji}
              <div style={{position:"absolute",bottom:10,right:12,background:"rgba(0,0,0,0.6)",borderRadius:8,padding:"3px 9px",fontSize:11,color:"#fff",fontWeight:600}}>🎬 {t.dur}</div>
              <div style={{position:"absolute",top:10,left:12}}><Bdg text={t.level} color={lc[t.level]||C.pink}/></div>
              <VideoWatermark/>
            </div>
            <div style={{padding:"14px 16px 16px"}}>
              <div style={{fontWeight:700,fontSize:15,color:C.text,marginBottom:8}}>{t.title}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div onClick={()=>openProfile(t.creator)} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}><VideoAvatar user={t.creator} size={24} showVideo/><span style={{fontSize:12,color:C.sub,textDecoration:"underline",textDecorationColor:"rgba(168,85,247,0.4)"}}>{t.creator.name}</span></div>
                <span style={{fontSize:12,color:C.sub}}>👁 {t.views}</span>
              </div>
              <button onClick={()=>showToast(`Playing: ${t.title} 🎬`)} style={{width:"100%",background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:12,padding:"12px",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>▶ Watch Tutorial</button>
            </div>
          </Card>
        ))}
      </div>
      <div style={{height:20}}/>
    </div>
  );
}

// ── CHALLENGES TAB ──
function ChallengesTab({showToast}) {
  const [challenges,setChallenges]=useState(INIT_CHALLENGES);
  const [joined,setJoined]=useState({});
  const [creating,setCreating]=useState(false);
  const [form,setForm]=useState({title:"",move:"",days:"7"});
  const create=()=>{
    if(!form.title.trim()||!form.move.trim()){showToast("Fill in all fields! ✏️");return;}
    setChallenges(p=>[{id:Date.now(),title:form.title,move:form.move,participants:1,daysLeft:parseInt(form.days),host:ME},...p]);
    setForm({title:"",move:"",days:"7"});setCreating(false);showToast("Challenge launched! 🏆");
  };
  return (
    <div>
      <div style={{padding:"52px 20px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <div style={{fontFamily:"'Pacifico',cursive",fontSize:24,color:C.text}}>Challenges 🏆</div>
          <button onClick={()=>setCreating(!creating)} style={{background:creating?"transparent":"linear-gradient(135deg,#FF3CAC,#A855F7)",border:creating?`1.5px solid ${C.pink}`:"none",borderRadius:12,padding:"8px 16px",color:creating?C.pink:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>{creating?"✕ Cancel":"+ Create"}</button>
        </div>
        <div style={{fontSize:13,color:C.sub}}>Show your moves, inspire the world!</div>
      </div>
      <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:14}}>
        {creating&&(
          <Card style={{padding:"18px",border:`1.5px solid ${C.pink}55`}}>
            <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14}}>✨ New Challenge</div>
            <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="Challenge title..." style={{width:"100%",background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",fontSize:13,color:C.text,marginBottom:10,outline:"none",boxSizing:"border-box"}}/>
            <input value={form.move} onChange={e=>setForm(p=>({...p,move:e.target.value}))} placeholder="Featured move..." style={{width:"100%",background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",fontSize:13,color:C.text,marginBottom:10,outline:"none",boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              {["3","5","7","14"].map(d=><button key={d} onClick={()=>setForm(p=>({...p,days:d}))} style={{flex:1,background:form.days===d?"linear-gradient(135deg,#FF3CAC,#A855F7)":C.bgAlt,border:`1px solid ${form.days===d?"transparent":C.border}`,borderRadius:10,padding:"9px 0",fontSize:13,fontWeight:700,color:form.days===d?"#fff":C.sub,cursor:"pointer"}}>{d}d</button>)}
            </div>
            <button onClick={create} style={{width:"100%",background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:14,padding:"13px 20px",fontWeight:700,fontSize:14,cursor:"pointer",color:"#fff"}}>🚀 Launch Challenge</button>
          </Card>
        )}
        {challenges.map(ch=>(
          <Card key={ch.id}>
            <div style={{padding:"16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div><div style={{fontWeight:800,fontSize:15,color:C.text,marginBottom:3}}>{ch.title}</div><div style={{fontSize:12,color:C.sub}}>Move: <span style={{color:C.pink,fontWeight:700}}>{ch.move}</span></div></div>
                <span style={{background:ch.daysLeft<=2?C.pinkL:C.purpleL,color:ch.daysLeft<=2?C.pink:C.purple,fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:10,border:`1px solid ${ch.daysLeft<=2?C.pink:C.purple}44`}}>{ch.daysLeft}d left</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <VideoAvatar user={ch.host} size={26} showVideo/>
                <span style={{fontSize:12,color:C.sub}}>by <b style={{color:C.text}}>{ch.host.name}</b></span>
                <span style={{marginLeft:"auto",fontSize:12,color:C.sub}}>👯 {(ch.participants+(joined[ch.id]?1:0)).toLocaleString()} joined</span>
              </div>
              <div style={{background:C.bgAlt,borderRadius:8,height:5,marginBottom:12}}><div style={{width:`${Math.min(100,Math.round((ch.participants/1500)*100))}%`,height:"100%",borderRadius:8,background:"linear-gradient(90deg,#FF3CAC,#A855F7)",transition:"width .5s"}}/></div>
              <button onClick={()=>{setJoined(p=>({...p,[ch.id]:!p[ch.id]}));if(!joined[ch.id])showToast(`Joined "${ch.title}"! 💃`);else showToast("Left challenge");}} style={{width:"100%",background:joined[ch.id]?"transparent":"linear-gradient(135deg,#FF3CAC,#A855F7)",border:joined[ch.id]?`1.5px solid ${C.pink}`:"none",borderRadius:13,padding:"12px",color:joined[ch.id]?C.pink:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>{joined[ch.id]?"✓ Joined — Tap to Leave":"Join Challenge 💃"}</button>
            </div>
          </Card>
        ))}
      </div>
      <div style={{height:20}}/>
    </div>
  );
}

// ── PROFILE TAB ──
function ProfileTab({showToast,setShowUpload,setShowAdmin,setShowSettings,setShowPrivacy,setShowHelp,setShowMyVideos,setShowSavedMoves,setShowMyChallenges,setShowContactReqs,notifs,contactRequests,bumRequests}) {
  const [edit,setEdit]=useState(false);
  const [profile,setProfile]=useState({name:ME.name,handle:ME.handle,bio:ME.bio});
  const [draft,setDraft]=useState({...profile});
  const [bumOn,setBumOn]=useState(ME.bumEnabled);
  const [downloadOn,setDownloadOn]=useState(ME.allowDownload);
  const save=()=>{
    const handleFlag=scanContactInfo(draft.handle);
    const bioFlag=scanContactInfo(draft.bio);
    if(handleFlag.flagged){showToast(`⚠ Username can't include ${handleFlag.reason}. Repeated attempts get you permanently banned.`);return;}
    if(bioFlag.flagged){showToast(`⚠ Bio can't include ${bioFlag.reason}. Repeated attempts get you permanently banned.`);return;}
    setProfile(draft);setEdit(false);showToast("Profile saved! ✨");
  };
  const pendingContacts=(contactRequests.received||[]).length;
  const pendingBum=(bumRequests.received||[]).length;

  const menuItems=[
    {icon:"🎬",label:"My Videos",badge:null,action:()=>setShowMyVideos(true)},
    {icon:"❤️",label:"Saved Moves",badge:null,action:()=>setShowSavedMoves(true)},
    {icon:"🏆",label:"My Challenges",badge:null,action:()=>setShowMyChallenges(true)},
    {icon:"📬",label:"Contact Requests",badge:pendingContacts||null,action:()=>setShowContactReqs(true)},
    {icon:"🔒",label:"Privacy & Safety",badge:null,action:()=>setShowPrivacy(true)},
    {icon:"⚙️",label:"Settings",badge:null,action:()=>setShowSettings(true)},
    {icon:"❓",label:"Help & Support",badge:null,action:()=>setShowHelp(true)},
    {icon:"🚪",label:"Sign Out",badge:null,action:()=>showToast("Sign out coming soon"),danger:true},
  ];

  return (
    <div>
      <div style={{padding:"52px 20px 0"}}>
        {/* Cover */}
        <div style={{borderRadius:22,background:"linear-gradient(135deg,#FF3CAC,#A855F7)",height:110,marginBottom:-44,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",right:-10,top:-10,fontSize:110,opacity:.08}}>💃</div>
        </div>

        {/* Avatar + edit */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:14}}>
          <div style={{position:"relative"}}>
            <div onClick={()=>setShowUpload("profile")} style={{width:80,height:80,borderRadius:"50%",background:"linear-gradient(135deg,#FF3CAC,#A855F7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:38,border:`3px solid ${C.bg}`,boxShadow:"0 4px 20px rgba(255,60,172,0.45)",overflow:"hidden",cursor:"pointer",position:"relative"}}>
              {ME.videoUrl?<video src={ME.videoUrl} autoPlay muted loop playsInline style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{animation:"wiggle 2.5s ease-in-out infinite",display:"inline-block"}}>💃</span>}
              <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0)",display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:4}}>
                <div style={{background:"rgba(0,0,0,0.6)",borderRadius:6,padding:"2px 8px",fontSize:9,color:"#fff",fontWeight:700}}>🎬 Edit</div>
              </div>
            </div>
            <div style={{position:"absolute",bottom:0,right:-4,width:26,height:26,borderRadius:"50%",background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:`2px solid ${C.bg}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,cursor:"pointer"}} onClick={()=>setShowUpload("profile")}>🎬</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setShowAdmin(true)} style={{background:C.goldL,border:`1px solid ${C.gold}44`,borderRadius:12,padding:"8px 14px",color:C.gold,fontWeight:700,fontSize:12,cursor:"pointer"}}>⚙ Admin</button>
            <button onClick={()=>edit?save():setEdit(true)} style={{background:edit?"linear-gradient(135deg,#00E5A0,#00B37E)":"transparent",border:`1.5px solid ${edit?C.green:C.border}`,borderRadius:12,padding:"8px 16px",color:edit?C.bg:C.text,fontWeight:700,fontSize:13,cursor:"pointer"}}>{edit?"✓ Save":"✏️ Edit"}</button>
          </div>
        </div>

        {edit?(
          <div style={{marginBottom:12}}>
            <input value={draft.name} onChange={e=>setDraft(p=>({...p,name:e.target.value}))} style={{width:"100%",background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 13px",fontSize:16,color:C.text,fontWeight:700,outline:"none",marginBottom:8,boxSizing:"border-box"}}/>
            <input value={draft.handle} onChange={e=>setDraft(p=>({...p,handle:e.target.value}))} style={{width:"100%",background:C.bgAlt,border:`1px solid ${scanContactInfo(draft.handle).flagged?"rgba(255,59,92,0.5)":C.border}`,borderRadius:10,padding:"9px 13px",fontSize:13,color:C.sub,outline:"none",marginBottom:4,boxSizing:"border-box"}}/>
            {scanContactInfo(draft.handle).flagged&&<div style={{fontSize:10.5,color:"#FF3B5C",fontWeight:600,marginBottom:8}}>⚠ Can't include {scanContactInfo(draft.handle).reason}</div>}
            <textarea value={draft.bio} onChange={e=>setDraft(p=>({...p,bio:e.target.value}))} style={{width:"100%",background:C.bgAlt,border:`1px solid ${scanContactInfo(draft.bio).flagged?"rgba(255,59,92,0.5)":C.border}`,borderRadius:10,padding:"9px 13px",fontSize:13,color:C.text,resize:"none",outline:"none",boxSizing:"border-box"}} rows={2}/>
            {scanContactInfo(draft.bio).flagged&&<div style={{fontSize:10.5,color:"#FF3B5C",fontWeight:600,marginTop:4}}>⚠ Bio can't include {scanContactInfo(draft.bio).reason} — that's what paid contact requests are for 🔒</div>}
          </div>
        ):(
          <div style={{marginBottom:12}}>
            <div style={{fontFamily:"'Pacifico',cursive",fontSize:22,color:C.text}}>{profile.name}</div>
            <div style={{fontSize:13,color:C.sub,marginBottom:4}}>@{profile.handle}</div>
            <div style={{fontSize:13,color:C.sub,marginBottom:8}}>{profile.bio}</div>
          </div>
        )}

        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          <Bdg text={`🌟 ${ME.badge}`} color={C.pink}/>
          {bumOn&&<BumBadge/>}
          <LiveBadge/>
        </div>

        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
          {[["Moves","12",C.pink],["Followers","1.2k",C.purple],["Following","88",C.peach]].map(([l,v,col])=>(
            <div key={l} style={{background:C.bgCard,borderRadius:14,padding:"12px 8px",textAlign:"center",border:`1px solid ${C.border}`}}>
              <div style={{fontSize:20,fontWeight:800,color:col}}>{v}</div>
              <div style={{fontSize:11,color:C.sub}}>{l}</div>
            </div>
          ))}
        </div>

        {/* Download toggle */}
        <div style={{background:C.bgCard,borderRadius:16,padding:"14px 16px",marginBottom:10,border:`1px solid ${C.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{fontSize:22}}>⬇️</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13,color:C.text}}>Allow Video Downloads</div>
              <div style={{fontSize:11,color:C.sub,marginTop:2}}>Shakybum watermark always applied to all downloads</div>
            </div>
            <div onClick={()=>{setDownloadOn(!downloadOn);showToast(downloadOn?"Downloads disabled":"Downloads enabled ✓");}} style={{width:46,height:26,borderRadius:13,background:downloadOn?"linear-gradient(135deg,#FF3CAC,#A855F7)":C.bgAlt,border:`1px solid ${downloadOn?C.pink:C.border}`,cursor:"pointer",position:"relative",transition:"all .3s",flexShrink:0}}>
              <div style={{width:20,height:20,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:downloadOn?23:3,transition:"left .3s",boxShadow:"0 2px 6px rgba(0,0,0,0.4)"}}/>
            </div>
          </div>
        </div>

        {/* Bum toggle */}
        <div style={{background:C.bgCard,borderRadius:16,padding:"14px 16px",marginBottom:10,border:`1px solid ${C.gold}33`}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{fontSize:22}}>🍑</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13,color:C.text}}>Offer Live Bum Sessions</div>
              <div style={{fontSize:11,color:C.sub,marginTop:2}}>Allow private 1-on-1 dance requests from your followers</div>
            </div>
            <div onClick={()=>{setBumOn(!bumOn);showToast(bumOn?"Live Bum sessions disabled":"Live Bum sessions enabled! 🍑");}} style={{width:46,height:26,borderRadius:13,background:bumOn?"linear-gradient(135deg,#FFD700,#FF9A76)":C.bgAlt,border:`1px solid ${bumOn?C.gold:C.border}`,cursor:"pointer",position:"relative",transition:"all .3s",flexShrink:0}}>
              <div style={{width:20,height:20,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:bumOn?23:3,transition:"left .3s",boxShadow:"0 2px 6px rgba(0,0,0,0.4)"}}/>
            </div>
          </div>
        </div>

        {/* AI analysis */}
        <div style={{background:C.bgCard,borderRadius:16,padding:"14px 16px",marginBottom:10,border:`1px solid ${C.purple}33`}}>
          <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:4}}>🤖 AI Dance Analysis</div>
          <div style={{fontSize:12,color:C.sub,marginBottom:10}}>Waist Wine consistency improved 18% this week!</div>
          <div style={{display:"flex",gap:8}}>
            {[["Rhythm","82%",C.pink],["Flexibility","74%",C.purple],["Isolation","90%",C.green]].map(([k,v,col])=>(
              <div key={k} style={{flex:1,background:C.bgAlt,borderRadius:10,padding:"8px",textAlign:"center",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:16,fontWeight:800,color:col}}>{v}</div>
                <div style={{fontSize:10,color:C.sub}}>{k}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Progress */}
        <div style={{background:C.bgCard,borderRadius:16,padding:"14px 16px",marginBottom:16,border:`1px solid ${C.gold}33`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <div style={{fontSize:13,fontWeight:700,color:C.gold}}>🌟 Progress to Platinum</div>
            <div style={{fontSize:12,color:C.sub}}>3 challenges left</div>
          </div>
          <div style={{background:C.bgAlt,borderRadius:6,height:7}}><div style={{width:"70%",height:"100%",borderRadius:6,background:"linear-gradient(90deg,#FFD700,#FF9A76)"}}/></div>
        </div>

        {/* Menu items */}
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:24}}>
          {menuItems.map(({icon,label,badge,action,danger})=>(
            <div key={label} onClick={action} style={{background:C.bgCard,padding:"15px 16px",borderRadius:14,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:14,cursor:"pointer",border:`1px solid ${C.border}`,color:danger?"#FF3B5C":C.text,transition:"border-color .2s"}}>
              <span>{icon} {label}</span>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                {badge&&<div style={{minWidth:20,height:20,borderRadius:10,background:C.pink,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",padding:"0 6px"}}>{badge}</div>}
                <span style={{color:C.sub}}>›</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── MY CHALLENGES SCREEN ──
function MyChallengesScreen({onClose,showToast}) {
  const myChallenges=[
    {id:1,title:"Waist Wine 7-Day",move:"Waist Wine",participants:834,daysLeft:3,status:"active"},
    {id:2,title:"My Belly Roll Challenge",move:"Belly Roll",participants:45,daysLeft:0,status:"ended"},
  ];
  return (
    <div style={{position:"fixed",inset:0,background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`,zIndex:700,display:"flex",flexDirection:"column",maxWidth:390,margin:"0 auto"}}>
      <div style={{padding:"52px 20px 16px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onClose} style={{background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:12,width:38,height:38,cursor:"pointer",fontSize:18,color:C.text}}>✕</button>
        <div style={{fontFamily:"'Pacifico',cursive",fontSize:20,color:C.text}}>My Challenges 🏆</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 20px"}}>
        {myChallenges.map(ch=>(
          <div key={ch.id} style={{background:C.bgCard,borderRadius:16,padding:"16px",border:`1px solid ${ch.status==="active"?C.borderH:C.border}`,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <div style={{fontWeight:700,fontSize:15,color:C.text}}>{ch.title}</div>
              <Bdg text={ch.status==="active"?"LIVE":"ENDED"} color={ch.status==="active"?C.green:C.sub}/>
            </div>
            <div style={{fontSize:12,color:C.sub,marginBottom:8}}>Move: <span style={{color:C.pink,fontWeight:700}}>{ch.move}</span> · 👯 {ch.participants} joined</div>
            {ch.status==="active"&&<div style={{background:C.bgAlt,borderRadius:8,height:5,marginBottom:12}}><div style={{width:`${Math.min(100,Math.round((ch.participants/1000)*100))}%`,height:"100%",borderRadius:8,background:"linear-gradient(90deg,#FF3CAC,#A855F7)"}}/></div>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>showToast("Challenge insights coming soon 📊")} style={{flex:1,background:C.purpleL,border:`1px solid ${C.purple}44`,borderRadius:10,padding:"8px",color:C.purple,fontWeight:700,fontSize:12,cursor:"pointer"}}>📊 Insights</button>
              {ch.status==="active"&&<button onClick={()=>showToast("Challenge ended")} style={{flex:1,background:C.redL,border:"1px solid rgba(255,59,92,0.3)",borderRadius:10,padding:"8px",color:"#FF3B5C",fontWeight:700,fontSize:12,cursor:"pointer"}}>⛔ End Early</button>}
            </div>
          </div>
        ))}
        <div style={{height:30}}/>
      </div>
    </div>
  );
}

// ── CONTACT REQUESTS SCREEN ──
function ContactRequestsScreen({onClose,showToast,contactRequests,approvedContacts,users,openChat,approveContact,declineContact}) {
  const incoming=contactRequests.received||[];
  const approve=async uid=>{await approveContact(uid);};
  const deny=async uid=>{await declineContact(uid);};
  return (
    <div style={{position:"fixed",inset:0,background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`,zIndex:700,display:"flex",flexDirection:"column",maxWidth:390,margin:"0 auto"}}>
      <div style={{padding:"52px 20px 16px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onClose} style={{background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:12,width:38,height:38,cursor:"pointer",fontSize:18,color:C.text}}>✕</button>
        <div style={{fontFamily:"'Pacifico',cursive",fontSize:20,color:C.text}}>Contact Requests 📬</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 20px"}}>
        {incoming.length>0&&<>
          <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>Incoming ({incoming.length})</div>
          {incoming.map(uid=>{const u=users.find(x=>x.id===uid);if(!u)return null;return(
            <div key={uid} style={{background:C.bgCard,borderRadius:16,padding:"14px",border:`1px solid ${C.borderH}`,marginBottom:10}}>
              <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:12}}><VideoAvatar user={u} size={46} showVideo/><div><div style={{fontWeight:700,color:C.text}}>{u.name}</div><div style={{fontSize:12,color:C.sub}}>@{u.handle} · {u.badge}</div></div></div>
              <div style={{background:"rgba(255,215,0,0.08)",borderRadius:12,padding:"10px 14px",fontSize:12,color:"#C8A600",marginBottom:12,border:"1px solid rgba(255,215,0,0.2)"}}><b>{u.name}</b> wants to see your contact details. Only approve people you trust!</div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>deny(uid)} style={{flex:1,background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px",color:C.sub,fontWeight:700,fontSize:13,cursor:"pointer"}}>✕ Decline</button>
                <button onClick={()=>approve(uid)} style={{flex:2,background:"linear-gradient(135deg,#00E5A0,#00B37E)",border:"none",borderRadius:12,padding:"10px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>✓ Approve</button>
              </div>
            </div>
          );})}
        </>}
        {(contactRequests.sent||[]).length>0&&<>
          <div style={{fontSize:12,fontWeight:700,color:C.sub,margin:"16px 0 10px",textTransform:"uppercase",letterSpacing:1}}>Sent Requests</div>
          {(contactRequests.sent||[]).map(uid=>{const u=users.find(x=>x.id===uid);if(!u)return null;return(
            <div key={uid} style={{background:C.bgCard,borderRadius:14,padding:"14px",border:`1px solid ${C.border}`,marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <VideoAvatar user={u} size={40} showVideo/><div style={{flex:1}}><div style={{fontWeight:600,color:C.text}}>{u.name}</div><div style={{fontSize:12,color:C.peach}}>⏳ Held in escrow — awaiting their decision</div></div>
              </div>
            </div>
          );})}
        </>}
        {approvedContacts.length>0&&<>
          <div style={{fontSize:12,fontWeight:700,color:C.sub,margin:"16px 0 10px",textTransform:"uppercase",letterSpacing:1}}>Approved</div>
          {approvedContacts.map(uid=>{const u=users.find(x=>x.id===uid);if(!u)return null;return(
            <div key={uid} style={{background:C.bgCard,borderRadius:14,padding:"14px",border:`1px solid ${C.green}44`,marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}><VideoAvatar user={u} size={40} showVideo/><div style={{flex:1}}><div style={{fontWeight:600,color:C.text}}>{u.name}</div><div style={{fontSize:11,color:C.green}}>✅ You can see their details</div></div></div>
              <div style={{background:C.greenL,borderRadius:10,padding:"10px 12px",border:`1px solid ${C.green}33`,marginBottom:8}}>
                <div style={{fontSize:12,color:C.text}}>📧 {u.contact}</div><div style={{fontSize:12,color:C.text,marginTop:4}}>📱 {u.phone}</div>
              </div>
              <button onClick={()=>openChat(u)} style={{width:"100%",background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:10,padding:"9px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>💬 Chat</button>
            </div>
          );})}
        </>}
        {incoming.length===0&&(contactRequests.sent||[]).length===0&&approvedContacts.length===0&&(
          <div style={{textAlign:"center",padding:"60px 20px",color:C.sub}}>
            <div style={{fontSize:48,marginBottom:12}}>📬</div>
            <div style={{fontWeight:700,color:C.text,marginBottom:6}}>No contact requests yet</div>
            <div style={{fontSize:13}}>Go to Community → Discover to request contacts from other creators</div>
          </div>
        )}
        <div style={{height:30}}/>
      </div>
    </div>
  );
}

// ── CHAT SCREEN (unlocked only after a paid contact request is approved) ──
function ChatScreen({user,onClose,messages,onSend,onBlock}) {
  const [draft,setDraft]=useState("");
  const [showMenu,setShowMenu]=useState(false);
  const listRef=useRef(null);
  const msgs=messages||[];

  useEffect(()=>{ if(listRef.current) listRef.current.scrollTop=listRef.current.scrollHeight; },[msgs.length]);

  const send=()=>{
    const text=draft.trim();
    if(!text) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div style={{position:"fixed",inset:0,background:C.bg,zIndex:750,display:"flex",flexDirection:"column",maxWidth:390,margin:"0 auto"}}>
      <div style={{padding:"52px 16px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:`1px solid ${C.border}`,position:"relative"}}>
        <button onClick={onClose} style={{background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:12,width:36,height:36,cursor:"pointer",fontSize:16,color:C.text}}>←</button>
        <VideoAvatar user={user} size={38}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:14,color:C.text}}>{user.name}</div>
          <div style={{fontSize:11,color:C.green}}>✅ Contact unlocked</div>
        </div>
        <button onClick={()=>setShowMenu(m=>!m)} style={{background:"transparent",border:"none",color:C.sub,fontSize:20,cursor:"pointer",padding:"4px 8px"}}>⋮</button>
        {showMenu&&(
          <div style={{position:"absolute",top:56,right:16,background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",zIndex:10,minWidth:170,boxShadow:"0 8px 24px rgba(0,0,0,0.4)"}}>
            <button onClick={()=>{setShowMenu(false);onBlock();}} style={{width:"100%",textAlign:"left",background:"none",border:"none",padding:"12px 14px",color:C.red,fontWeight:700,fontSize:13,cursor:"pointer"}}>🚫 Report & block</button>
          </div>
        )}
      </div>

      <div ref={listRef} style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:8}}>
        <div style={{textAlign:"center",fontSize:11,color:C.sub,margin:"0 0 8px"}}>🔒 You paid to unlock this contact. Be respectful — abusive messages can be reported.</div>
        {msgs.length===0&&(
          <div style={{textAlign:"center",padding:"40px 20px",color:C.sub}}>
            <div style={{fontSize:36,marginBottom:8}}>💬</div>
            <div style={{fontSize:13}}>Say hi to {user.name.split(" ")[0]}!</div>
          </div>
        )}
        {msgs.map(m=>(
          <div key={m.id} style={{alignSelf:m.from==="me"?"flex-end":"flex-start",maxWidth:"78%"}}>
            <div style={{background:m.from==="me"?"linear-gradient(135deg,#FF3CAC,#A855F7)":C.bgCard,color:m.from==="me"?"#fff":C.text,border:m.from==="me"?"none":`1px solid ${C.border}`,borderRadius:16,padding:"9px 13px",fontSize:13.5,lineHeight:1.4}}>{m.text}</div>
            <div style={{fontSize:9.5,color:C.sub,marginTop:3,textAlign:m.from==="me"?"right":"left"}}>{m.time}</div>
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:8,padding:"10px 14px",borderTop:`1px solid ${C.border}`,paddingBottom:"max(10px, env(safe-area-inset-bottom))"}}>
        <input
          value={draft}
          onChange={e=>setDraft(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter")send();}}
          placeholder="Message..."
          style={{flex:1,background:C.bgAlt,border:`1.5px solid ${C.border}`,borderRadius:20,padding:"11px 16px",fontSize:14,color:C.text,outline:"none"}}
        />
        <button onClick={send} disabled={!draft.trim()} style={{background:draft.trim()?"linear-gradient(135deg,#FF3CAC,#A855F7)":C.bgAlt,border:"none",borderRadius:"50%",width:42,height:42,color:"#fff",fontSize:16,cursor:draft.trim()?"pointer":"default",flexShrink:0}}>➤</button>
      </div>
    </div>
  );
}

// ── BUM SESSION SCREEN (running timer for a confirmed, duration-paid session) ──
function BumSessionScreen({session,user,onExtend,onEnd}) {
  const mins=Math.floor(session.remainingSec/60);
  const secs=session.remainingSec%60;
  const pct=Math.max(0,Math.min(100,(session.remainingSec/(session.mins*60))*100));
  const isLow=session.remainingSec<=120&&session.remainingSec>0;
  const isOver=session.remainingSec<=0;

  return (
    <div style={{position:"fixed",inset:0,background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`,zIndex:780,display:"flex",flexDirection:"column",maxWidth:390,margin:"0 auto"}}>
      <div style={{padding:"52px 20px 10px",display:"flex",alignItems:"center",gap:12}}>
        <VideoAvatar user={user} size={40} showVideo/>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:14,color:C.text}}>{user.name}</div>
          <div style={{fontSize:11,color:C.gold}}>🍑 Live Bum Session {session.extensions>0?`· extended ×${session.extensions}`:""}</div>
        </div>
      </div>

      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 32px"}}>
        <div style={{position:"relative",width:220,height:220,marginBottom:24}}>
          <svg width="220" height="220" style={{transform:"rotate(-90deg)"}}>
            <circle cx="110" cy="110" r="98" fill="none" stroke={C.bgAlt} strokeWidth="12"/>
            <circle cx="110" cy="110" r="98" fill="none" stroke={isOver?C.red:isLow?C.peach:C.gold} strokeWidth="12" strokeLinecap="round"
              strokeDasharray={2*Math.PI*98} strokeDashoffset={2*Math.PI*98*(1-pct/100)} style={{transition:"stroke-dashoffset 1s linear"}}/>
          </svg>
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <div style={{fontSize:40,fontWeight:800,color:C.text,fontVariantNumeric:"tabular-nums"}}>{isOver?"0:00":`${mins}:${String(secs).padStart(2,"0")}`}</div>
            <div style={{fontSize:12,color:C.sub,marginTop:2}}>{isOver?"Time's up":isLow?"Running low":"remaining"}</div>
          </div>
        </div>

        {isOver&&<div style={{fontSize:13,color:C.sub,textAlign:"center",lineHeight:1.6,marginBottom:20}}>Session time is up. Extend to keep going, or end the session.</div>}

        <button onClick={onExtend} style={{width:"100%",background:"linear-gradient(135deg,#FFD700,#FF9A76)",border:"none",borderRadius:16,padding:"15px",color:"#0E0718",fontWeight:800,fontSize:15,cursor:"pointer",marginBottom:10}}>
          + Extend {BUM_EXTEND_MIN} min · GHS {bumPriceFor(user,BUM_EXTEND_MIN)}
        </button>
        <button onClick={onEnd} style={{width:"100%",background:"transparent",border:`1.5px solid ${C.border}`,borderRadius:16,padding:"13px",color:C.sub,fontWeight:700,fontSize:14,cursor:"pointer"}}>
          {isOver?"End Session":"⏹ End Session Early"}
        </button>
      </div>
    </div>
  );
}

// ── MOMO PAYMENT MODAL (mock — see momo_integration_guide.md for real Paystack wiring) ──
const MOMO_NETWORKS=[
  {id:"mtn",name:"MTN MoMo",color:"#FFCC08",textColor:"#1a1a1a",prefixes:["024","025","053","054","055","059"]},
  {id:"vodafone",name:"Vodafone Cash",color:"#E60000",textColor:"#fff",prefixes:["020","050"]},
  {id:"airteltigo",name:"AirtelTigo",color:"#0033A0",textColor:"#fff",prefixes:["026","027","056","057"]},
];
function detectMomoNetwork(phone){
  const digits=phone.replace(/\D/g,"");
  const prefix=digits.slice(0,3);
  return MOMO_NETWORKS.find(n=>n.prefixes.includes(prefix))||null;
}
function MomoNetworkPill({net,active,onClick}){
  return (
    <button onClick={onClick} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"12px 8px",borderRadius:14,cursor:"pointer",border:`1.5px solid ${active?C.pink:C.border}`,background:active?C.pinkL:C.bgAlt}}>
      <div style={{width:30,height:30,borderRadius:8,background:net.color,color:net.textColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800}}>{net.name.split(" ")[0].slice(0,2).toUpperCase()}</div>
      <div style={{fontSize:10.5,fontWeight:700,color:active?C.pink:C.sub,textAlign:"center",lineHeight:1.2}}>{net.name}</div>
    </button>
  );
}
/**
 * MomoPaymentModal — real Mobile Money checkout. Collects phone+network,
 * then calls the caller-supplied `onSubmit(phone, providerId)` — which
 * initiates the real charge against the backend and polls until the
 * Paystack webhook confirms it (see MainApp's requestContact/requestBum/
 * extendBumSession for what onSubmit actually does). This component only
 * owns the UI state machine (form → confirm → pending → success/failed),
 * not the payment logic itself.
 */
function MomoPaymentModal({amount=15,currency="GHS",purposeLabel="Unlock contact",ownerName="the creator",instant=false,onClose,onSubmit,onSuccess}){
  const [stage,setStage]=useState("form"); // form | confirm | pending | success | failed
  const [phone,setPhone]=useState("");
  const [error,setError]=useState("");
  const [failReason,setFailReason]=useState("");
  const [selectedNet,setSelectedNet]=useState(null);
  const [shakeKey,setShakeKey]=useState(0);
  const net=selectedNet||detectMomoNetwork(phone);

  const handleContinue=()=>{
    const digits=phone.replace(/\D/g,"");
    if(digits.length<9){setError("Enter a valid mobile money number");setShakeKey(k=>k+1);return;}
    if(!net){setError("Select your network");setShakeKey(k=>k+1);return;}
    setError("");setStage("confirm");
  };
  const handlePay=async()=>{
    setStage("pending");
    try{
      await onSubmit(phone.replace(/\D/g,""),net.id);
      setStage("success");
      setTimeout(()=>onSuccess&&onSuccess(),1100);
    }catch(err){
      setFailReason(err?.message||"Payment didn't go through");
      setStage("failed");
    }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:800,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={stage==="pending"?undefined:onClose}>
      <div className="fade-up" style={{width:"100%",maxWidth:390,background:C.bgCard,borderRadius:"24px 24px 0 0",padding:"10px 22px 28px",border:`1px solid ${C.border}`,borderBottom:"none"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,borderRadius:2,background:C.border,margin:"6px auto 18px"}}/>

        {stage==="form"&&(<>
          <div style={{textAlign:"center",marginBottom:18}}>
            <div style={{fontSize:13,color:C.sub,fontWeight:600,marginBottom:4}}>{purposeLabel}</div>
            <div style={{fontFamily:"'Pacifico',cursive",fontSize:30,color:C.text}}>{currency} {amount.toFixed(2)}</div>
          </div>
          <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:8,letterSpacing:.3}}>SELECT NETWORK</div>
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            {MOMO_NETWORKS.map(n=><MomoNetworkPill key={n.id} net={n} active={net?.id===n.id} onClick={()=>setSelectedNet(n)}/>)}
          </div>
          <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:8,letterSpacing:.3}}>MOBILE MONEY NUMBER</div>
          <div key={shakeKey} className={shakeKey?"shake":""}>
            <div style={{position:"relative",marginBottom:6}}>
              <div style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:14,color:C.sub,fontWeight:600}}>+233</div>
              <input value={phone} onChange={e=>setPhone(e.target.value.replace(/[^\d\s]/g,""))} placeholder="24 123 4567" inputMode="numeric"
                style={{width:"100%",background:C.bgAlt,border:`1.5px solid ${error?"rgba(255,59,92,0.5)":phone?C.borderH:C.border}`,borderRadius:14,padding:"13px 16px 13px 62px",fontSize:15,color:C.text,outline:"none"}}/>
            </div>
          </div>
          {error&&<div style={{fontSize:11,color:C.red,fontWeight:600,marginBottom:8}}>⚠ {error}</div>}
          <div style={{background:C.bgAlt,borderRadius:12,padding:"10px 12px",fontSize:11.5,color:C.sub,lineHeight:1.5,margin:"10px 0 18px"}}>
            🔒 {instant?"This charges instantly and adds the time to your session right away.":`Payment is held until ${ownerName} approves. If declined, you're refunded automatically.`}
          </div>
          <button onClick={handleContinue} style={{width:"100%",background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:16,padding:"15px",color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer"}}>Continue</button>
        </>)}

        {stage==="confirm"&&net&&(
          <div style={{textAlign:"center"}}>
            <div style={{width:52,height:52,borderRadius:14,background:net.color,color:net.textColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,margin:"0 auto 14px"}}>{net.name.split(" ")[0].slice(0,2).toUpperCase()}</div>
            <div style={{fontSize:14,color:C.sub,marginBottom:4}}>Paying with {net.name}</div>
            <div style={{fontFamily:"'Pacifico',cursive",fontSize:28,color:C.text,marginBottom:6}}>{currency} {amount.toFixed(2)}</div>
            <div style={{fontSize:13,color:C.sub,marginBottom:22}}>+233 {phone.replace(/\D/g,"")}</div>
            <button onClick={handlePay} style={{width:"100%",background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:16,padding:"15px",color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",marginBottom:10}}>Confirm & Pay</button>
            <button onClick={()=>setStage("form")} style={{width:"100%",background:"none",border:"none",color:C.sub,fontWeight:600,fontSize:13,padding:8,cursor:"pointer"}}>← Edit details</button>
          </div>
        )}

        {stage==="pending"&&(
          <div style={{textAlign:"center",padding:"10px 0 6px"}}>
            <div style={{width:60,height:60,borderRadius:"50%",background:C.pinkL,border:`2px solid ${C.pink}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,margin:"0 auto 18px",animation:"pulse 1.2s ease-in-out infinite"}}>📲</div>
            <div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:6}}>Check your phone</div>
            <div style={{fontSize:13,color:C.sub,lineHeight:1.6,marginBottom:4}}>Approve the {net?.name} prompt on<br/><b style={{color:C.text}}>+233 {phone.replace(/\D/g,"")}</b></div>
            <div style={{fontSize:11.5,color:C.sub,marginTop:14}}>Waiting for confirmation…</div>
          </div>
        )}

        {stage==="success"&&(
          <div style={{textAlign:"center",padding:"6px 0"}}>
            <div style={{width:60,height:60,borderRadius:"50%",background:C.greenL,border:`2px solid ${C.green}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,margin:"0 auto 16px"}}>✓</div>
            <div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:6}}>Payment received</div>
            <div style={{fontSize:13,color:C.sub}}>Unlocking now…</div>
          </div>
        )}

        {stage==="failed"&&(
          <div style={{textAlign:"center",padding:"6px 0"}}>
            <div style={{width:60,height:60,borderRadius:"50%",background:C.redL,border:`2px solid ${C.red}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,margin:"0 auto 16px"}}>✕</div>
            <div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:6}}>Payment didn't go through</div>
            <div style={{fontSize:13,color:C.sub,marginBottom:20,lineHeight:1.5}}>{failReason}</div>
            <button onClick={()=>{setStage("form");setFailReason("");}} style={{width:"100%",background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:16,padding:"15px",color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",marginBottom:10}}>Try again</button>
            <button onClick={onClose} style={{width:"100%",background:"transparent",border:"none",color:C.sub,fontWeight:700,fontSize:13,padding:8,cursor:"pointer"}}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── VIDEO UPLOAD MODAL ──
function VideoUploadModal({mode="post",onClose,onDone,showToast}) {
  const [step,setStep]=useState("choose");
  const [videoURL,setVideoURL]=useState(null); // local blob: URL, used for preview only
  const [uploadedUrl,setUploadedUrl]=useState(null); // real permanent URL from Supabase Storage, set after doUpload succeeds
  const [caption,setCaption]=useState("");
  const [moveTag,setMoveTag]=useState("");
  const [recTime,setRecTime]=useState(0);
  const [prog,setProg]=useState(0);
  const [camError,setCamError]=useState(null);
  const timerRef=useRef(null);
  const streamRef=useRef(null);
  const camVideoRef=useRef(null); // live <video> showing the camera feed during cam/recording steps
  const recorderRef=useRef(null);
  const chunksRef=useRef([]);
  const maxSec=mode==="profile"||mode==="short"?15:60;

  const startCamera=async()=>{
    setStep("cam");setCamError(null);
    try{
      const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:true});
      streamRef.current=s;
      if(camVideoRef.current)camVideoRef.current.srcObject=s;
    }catch(e){
      // No silent failure — permission-denied, no camera, and insecure-context
      // (getUserMedia requires HTTPS, which is fine on the deployed PWA but
      // will fail on a plain http:// dev server) all land here.
      const reason=e?.name==="NotAllowedError"?"Camera permission was denied.":
                   e?.name==="NotFoundError"?"No camera found on this device.":
                   "Couldn't access the camera.";
      setCamError(reason);
      showToast&&showToast(`🚫 ${reason}`);
    }
  };
  const startRec=()=>{
    if(!streamRef.current)return;
    chunksRef.current=[];
    let recorder;
    try{
      recorder=new MediaRecorder(streamRef.current,{mimeType:MediaRecorder.isTypeSupported("video/webm")?"video/webm":undefined});
    }catch(e){
      showToast&&showToast("🚫 Recording isn't supported in this browser.");
      return;
    }
    recorder.ondataavailable=e=>{if(e.data.size>0)chunksRef.current.push(e.data);};
    recorder.onstop=()=>{
      const blob=new Blob(chunksRef.current,{type:"video/webm"});
      setVideoURL(prev=>{if(prev&&prev.startsWith("blob:"))URL.revokeObjectURL(prev);return URL.createObjectURL(blob);});
      setStep("preview");
    };
    recorderRef.current=recorder;
    recorder.start();
    setRecTime(0);setStep("recording");
    timerRef.current=setInterval(()=>{setRecTime(p=>{if(p+1>=maxSec){stopRec();return p+1;}return p+1;});},1000);
  };
  const stopRec=()=>{
    clearInterval(timerRef.current);
    if(recorderRef.current&&recorderRef.current.state!=="inactive")recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(t=>t.stop());
  };
  const selectFile=e=>{
    const f=e.target.files?.[0];
    if(!f)return;
    if(!f.type.startsWith("video/")){showToast("🚫 Videos only! No photos on Shakybum.");return;}
    setVideoURL(prev=>{if(prev&&prev.startsWith("blob:"))URL.revokeObjectURL(prev);return URL.createObjectURL(f);});
    setStep("preview");
  };
  const retake=()=>{
    setVideoURL(prev=>{if(prev&&prev.startsWith("blob:"))URL.revokeObjectURL(prev);return null;});
    setStep("choose");
  };
  const doUpload=async()=>{
    if(mode!=="profile"&&mode!=="short"&&!moveTag){showToast("Tag a move first! 💃");return;}
    const capFlag=scanContactInfo(caption);
    if(capFlag.flagged){showToast(`🚫 Caption can't include ${capFlag.reason}. Repeated attempts get you permanently banned — use paid Contact requests instead`);return;}
    if(!videoURL){showToast("No video to upload");return;}

    setStep("uploading");setProg(0);
    // fetch doesn't expose real upload-progress without XHR — this animates
    // smoothly toward ~90% while the real upload is in flight, then jumps to
    // 100% on actual success. The upload itself is real; only the progress
    // bar's exact percentage during transit is approximated.
    const progInterval=setInterval(()=>setProg(p=>p<90?p+Math.random()*8+2:p),220);
    try{
      const blob=await(await fetch(videoURL)).blob();
      console.log("[upload diagnostic] blob type:",blob.type,"size:",blob.size,"bytes");
      const{url}=await api.media.uploadVideo(blob);
      console.log("[upload diagnostic] backend returned url:",url);
      clearInterval(progInterval);
      setProg(100);
      setUploadedUrl(url);
      setStep("done");
    }catch(err){
      console.error("[upload diagnostic] upload failed:",err);
      clearInterval(progInterval);
      showToast(err?.message||"Upload failed — check your connection and try again");
      setStep("preview");
    }
  };
  useEffect(()=>()=>{
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t=>t.stop());
    if(videoURL&&videoURL.startsWith("blob:"))URL.revokeObjectURL(videoURL);
  },[]);
  const pct=Math.min(100,Math.round((recTime/maxSec)*100));
  const title={post:"Post a Dance Video",profile:"Profile Video (15s)",short:"New ShakyShort (15s)"}[mode]||"Upload Video";
  const doneMsg={post:"Video posted! The community can like and comment 🔥",profile:"Profile video set! Your animated avatar is live 💃",short:"ShakyShort posted! It'll appear in the Shorts feed ⚡"}[mode]||"Done!";

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(5,0,14,0.97)",zIndex:800,display:"flex",flexDirection:"column",maxWidth:390,margin:"0 auto"}}>
      <div style={{padding:"52px 20px 14px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onClose} style={{background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:12,width:38,height:38,cursor:"pointer",fontSize:18,color:C.text,flexShrink:0}}>✕</button>
        <Logo size="sm"/>
        <div style={{marginLeft:"auto",fontSize:12,fontWeight:700,color:C.sub}}>{title}</div>
      </div>
      {step==="choose"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 24px",gap:14}}>
          <div style={{fontSize:60}}>{mode==="short"?"⚡":"🎬"}</div>
          <div style={{fontFamily:"'Pacifico',cursive",fontSize:20,color:C.text,textAlign:"center"}}>{title}</div>
          <div style={{fontSize:13,color:C.sub,textAlign:"center",lineHeight:1.7,maxWidth:290}}>
            {mode==="short"?"Short looping clips, max 15s. Appear in ShakyShorts feed and expire after 24h.":mode==="profile"?"Record 15 seconds of your best waist move — becomes your animated avatar everywhere!":"Videos only — no static photos. Show the community your moves."}
          </div>
          <div style={{background:C.bgCard,borderRadius:14,padding:"12px 16px",width:"100%",border:`1px solid ${C.borderH}`,display:"flex",gap:10,alignItems:"center"}}>
            <span style={{fontSize:20}}>🍑</span>
            <div><div style={{fontSize:12,fontWeight:700,color:C.pink,marginBottom:1}}>Shakybum Watermark Applied</div><div style={{fontSize:11,color:C.sub}}>All videos carry our brand watermark automatically.</div></div>
          </div>
          <div style={{background:C.redL,borderRadius:14,padding:"12px 16px",width:"100%",border:`1px solid ${C.red}44`,display:"flex",gap:10,alignItems:"center"}}>
            <span style={{fontSize:20}}>⚠️</span>
            <div style={{fontSize:11,color:C.sub,lineHeight:1.5}}><b style={{color:C.text}}>No contact info allowed</b> — in speech, on-screen text, or captions. Violators are permanently banned.</div>
          </div>
          <button onClick={startCamera} style={{width:"100%",background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:14,padding:"13px",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}><span style={{fontSize:20}}>📹</span> Record Now</button>
          <label style={{width:"100%",background:C.bgCard,border:`1.5px solid ${C.border}`,borderRadius:14,padding:"13px",color:C.text,fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
            <span style={{fontSize:20}}>📁</span> Upload from Device
            <input type="file" accept="video/*" onChange={selectFile} style={{display:"none"}}/>
          </label>
          <div style={{fontSize:11,color:C.sub}}>Max {maxSec}s · MP4 · MOV · WebM</div>
        </div>
      )}
      {(step==="cam"||step==="recording")&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",position:"relative"}}>
          <div style={{flex:1,background:"#000",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
            {camError?(
              <div style={{textAlign:"center",padding:"0 32px"}}>
                <div style={{fontSize:44,marginBottom:10}}>🚫</div>
                <div style={{fontSize:14,color:C.text,fontWeight:700,marginBottom:6}}>{camError}</div>
                <div style={{fontSize:12,color:C.sub,lineHeight:1.6}}>Check your browser's site permissions and try again, or upload a video from your device instead.</div>
              </div>
            ):(
              <video ref={camVideoRef} autoPlay muted playsInline style={{width:"100%",height:"100%",objectFit:"cover",transform:"scaleX(-1)"}}/>
            )}
            {step==="recording"&&<>
              <div style={{position:"absolute",top:14,left:"50%",transform:"translateX(-50%)",background:"rgba(255,59,92,0.92)",borderRadius:20,padding:"5px 16px",display:"flex",alignItems:"center",gap:8}}>
                <span className="live-flash" style={{color:"#fff",fontSize:10}}>●</span>
                <span style={{fontWeight:700,color:"#fff",fontSize:13}}>{String(Math.floor(recTime/60)).padStart(2,"0")}:{String(recTime%60).padStart(2,"0")}</span>
              </div>
              <div style={{position:"absolute",bottom:0,left:0,right:0,height:5,background:"rgba(255,255,255,0.15)"}}>
                <div style={{height:"100%",background:"linear-gradient(90deg,#FF3CAC,#A855F7)",width:`${pct}%`,transition:"width .9s linear"}}/>
              </div>
            </>}
          </div>
          <div style={{padding:"20px 24px 36px",background:C.bg,display:"flex",justifyContent:"center",alignItems:"center",gap:28}}>
            <button onClick={()=>{setStep("choose");streamRef.current?.getTracks().forEach(t=>t.stop());}} style={{width:46,height:46,borderRadius:"50%",background:C.bgCard,border:`1px solid ${C.border}`,cursor:"pointer",fontSize:18,color:C.sub}}>✕</button>
            {step==="cam"?<button onClick={startRec} disabled={!!camError} className="rec-pulse" style={{width:74,height:74,borderRadius:"50%",background:camError?C.bgCard:"linear-gradient(135deg,#FF3B5C,#FF6B6B)",border:"4px solid rgba(255,59,92,0.35)",cursor:camError?"default":"pointer",fontSize:30,opacity:camError?0.4:1}}>●</button>
            :<button onClick={stopRec} className="rec-pulse" style={{width:74,height:74,borderRadius:20,background:"#FF3B5C",border:"4px solid rgba(255,59,92,0.4)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:28,height:28,borderRadius:5,background:"#fff"}}/></button>}
            <div style={{width:46,height:46}}/>
          </div>
        </div>
      )}
      {step==="preview"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",padding:"0 20px"}}>
          <div style={{flex:1,borderRadius:20,overflow:"hidden",background:"#000",marginBottom:14,position:"relative",minHeight:240,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {videoURL?(
              <video src={videoURL} controls playsInline loop style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            ):(
              <div style={{textAlign:"center"}}><div style={{fontSize:64}}>💃</div><div style={{fontSize:13,color:C.sub}}>Video ready</div></div>
            )}
            <VideoWatermark/>
            <button onClick={retake} style={{position:"absolute",top:12,right:12,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:10,padding:"6px 12px",color:"#fff",fontSize:12,cursor:"pointer"}}>🔄 Retake</button>
          </div>
          {mode==="post"&&<>
            <input value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Describe your move... 💃" style={{width:"100%",background:C.bgCard,border:`1px solid ${scanContactInfo(caption).flagged?"rgba(255,59,92,0.6)":C.border}`,borderRadius:12,padding:"12px 14px",fontSize:14,color:C.text,outline:"none",marginBottom:scanContactInfo(caption).flagged?4:10}}/>
            {scanContactInfo(caption).flagged&&<div style={{fontSize:11,color:"#FF3B5C",fontWeight:600,marginBottom:8}}>⚠ Can't include {scanContactInfo(caption).reason}</div>}
            <div style={{fontSize:12,color:C.sub,marginBottom:8,fontWeight:600}}>Tag a move *</div>
            <div style={{display:"flex",gap:8,marginBottom:14,overflowX:"auto",scrollbarWidth:"none"}}>
              {["Waist Wine","Belly Roll","Shakira Twist","Azonto","Dancehall Dip","Tummy Pop"].map(m=>(
                <button key={m} onClick={()=>setMoveTag(m)} style={{flexShrink:0,background:moveTag===m?"linear-gradient(135deg,#FF3CAC,#A855F7)":C.bgCard,border:`1px solid ${moveTag===m?"transparent":C.border}`,borderRadius:20,padding:"7px 14px",color:moveTag===m?"#fff":C.sub,fontSize:12,fontWeight:700,cursor:"pointer"}}>{m}</button>
              ))}
            </div>
          </>}
          {mode==="short"&&<>
            <input value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Add a caption... ⚡" style={{width:"100%",background:C.bgCard,border:`1px solid ${scanContactInfo(caption).flagged?"rgba(255,59,92,0.6)":C.border}`,borderRadius:12,padding:"12px 14px",fontSize:14,color:C.text,outline:"none",marginBottom:scanContactInfo(caption).flagged?4:14}}/>
            {scanContactInfo(caption).flagged&&<div style={{fontSize:11,color:"#FF3B5C",fontWeight:600,marginBottom:10}}>⚠ Can't include {scanContactInfo(caption).reason}</div>}
          </>}
          <button onClick={doUpload} style={{width:"100%",background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:14,padding:"13px",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>{mode==="profile"?"✓ Set as Profile Video":mode==="short"?"⚡ Post ShakyShort":"🚀 Post Video"}</button>
        </div>
      )}
      {step==="uploading"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 32px",gap:20}}>
          <div style={{width:80,height:80,borderRadius:"50%",border:`5px solid ${C.border}`,borderTop:`5px solid ${C.pink}`,animation:"spinRing 1s linear infinite"}}/>
          <div style={{fontWeight:700,fontSize:18,color:C.text}}>Uploading...</div>
          <div style={{width:"100%",background:C.bgCard,borderRadius:8,height:8,overflow:"hidden"}}><div style={{height:"100%",background:"linear-gradient(90deg,#FF3CAC,#A855F7)",width:`${prog}%`,transition:"width .2s ease",borderRadius:8}}/></div>
          <div style={{fontSize:13,color:C.sub}}>{Math.round(prog)}%</div>
        </div>
      )}
      {step==="done"&&(
        <div className="fade-up" style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 32px",gap:16,textAlign:"center"}}>
          <div style={{fontSize:72}}>🎉</div>
          <div style={{fontFamily:"'Pacifico',cursive",fontSize:24,color:C.text}}>{mode==="short"?"ShakyShort Live!":mode==="profile"?"Profile Set!":"Video Posted!"}</div>
          <div style={{fontSize:14,color:C.sub,lineHeight:1.7}}>{doneMsg}</div>
          <button onClick={()=>{onDone&&onDone({videoURL:uploadedUrl,caption,moveTag});onClose();}} style={{width:"100%",background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:14,padding:"13px",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",maxWidth:280}}>Done 🍑</button>
        </div>
      )}
    </div>
  );
}

// ── LIVE MODAL ──
function LiveModal({onClose,showToast}) {
  const [state,setState]=useState("setup");
  const [title,setTitle]=useState("");
  const [moveTag,setMoveTag]=useState("Waist Wine");
  const [viewers,setViewers]=useState(0);
  const [comments,setComments]=useState([{id:1,user:"amarabeats",text:"Yass queen!! 🔥",color:"#FF3CAC"},{id:2,user:"zarawave",text:"This move is everything 😍",color:"#A855F7"}]);
  const [cInput,setCInput]=useState("");
  const [elapsed,setElapsed]=useState(0);
  const commRef=useRef(null);
  const vT=useRef(null),cT=useRef(null),eT=useRef(null);
  const streamRef=useRef(null);
  const liveVideoRef=useRef(null); // shows YOUR OWN camera feed — going out to viewers isn't real (no streaming server), but you seeing yourself is
  const BOT=[{user:"salsaqueen",text:"Teaching me through the screen 💃",color:"#FF9A76"},{user:"nanagold",text:"Come to Accra!! 🇬🇭🔥",color:"#4CC9F0"},{user:"islandvibe",text:"Caribbean vibes!! 🌴",color:"#F72585"},{user:"afrogyal",text:"This is EVERYTHING 🍑",color:"#7FFF00"},{user:"shakyfan1",text:"Practicing right now 😂",color:"#FFD700"}];
  const startLive=async()=>{
    if(!title.trim()){showToast("Add a live title first! 📹");return;}
    try{
      const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:true});
      streamRef.current=s;
    }catch(e){
      // Camera is required to go live for real — no silent fallback to a
      // fake feed, since that would misrepresent what viewers would actually see.
      const reason=e?.name==="NotAllowedError"?"Camera permission was denied.":e?.name==="NotFoundError"?"No camera found on this device.":"Couldn't access the camera.";
      showToast&&showToast(`🚫 ${reason} Can't go live without it.`);
      return;
    }
    setState("live");setViewers(4);let i=0;
    vT.current=setInterval(()=>setViewers(p=>p+Math.floor(Math.random()*4+1)),3500);
    cT.current=setInterval(()=>{const c=BOT[i%BOT.length];setComments(p=>[...p.slice(-25),{id:Date.now(),user:c.user,text:c.text,color:c.color}]);i++;},2200);
    eT.current=setInterval(()=>setElapsed(p=>p+1),1000);
  };
  const endLive=()=>{
    [vT,cT,eT].forEach(r=>clearInterval(r.current));
    streamRef.current?.getTracks().forEach(t=>t.stop());
    setState("ended");
  };
  const sendComment=()=>{
    if(!cInput.trim())return;
    const flag=scanContactInfo(cInput);
    if(flag.flagged){showToast&&showToast(`🚫 Live chat can't include ${flag.reason}. Repeated attempts get you permanently banned.`);return;}
    setComments(p=>[...p.slice(-25),{id:Date.now(),user:"you",text:cInput.trim(),color:C.pink}]);setCInput("");
  };
  useEffect(()=>{if(commRef.current)commRef.current.scrollTop=commRef.current.scrollHeight;},[comments]);
  useEffect(()=>{if(state==="live"&&liveVideoRef.current&&streamRef.current)liveVideoRef.current.srcObject=streamRef.current;},[state]);
  useEffect(()=>()=>{[vT,cT,eT].forEach(r=>clearInterval(r.current));streamRef.current?.getTracks().forEach(t=>t.stop());},[]);
  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  return (
    <div style={{position:"fixed",inset:0,background:"#000",zIndex:900,display:"flex",flexDirection:"column",maxWidth:390,margin:"0 auto"}}>
      {state==="setup"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`}}>
          <div style={{padding:"52px 20px 16px",display:"flex",alignItems:"center",gap:12}}>
            <button onClick={onClose} style={{background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:12,width:38,height:38,cursor:"pointer",fontSize:18,color:C.text}}>✕</button>
            <Logo size="sm"/>
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 24px",gap:14}}>
            <div style={{width:100,height:100,borderRadius:"50%",background:"linear-gradient(135deg,#FF3CAC,#A855F7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:46,animation:"ringPulse 2s ease-in-out infinite"}}>💃</div>
            <div style={{fontFamily:"'Pacifico',cursive",fontSize:24,color:C.text,textAlign:"center"}}>Go Live</div>
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Live title (e.g. Waist Wine Masterclass 🌀)" style={{width:"100%",background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:14,padding:"13px 16px",fontSize:14,color:C.text,outline:"none"}}/>
            <div style={{display:"flex",gap:8,width:"100%",overflowX:"auto",scrollbarWidth:"none"}}>
              {["Waist Wine","Belly Roll","Azonto","Dancehall","Latin"].map(m=><button key={m} onClick={()=>setMoveTag(m)} style={{flexShrink:0,background:moveTag===m?"linear-gradient(135deg,#FF3CAC,#A855F7)":C.bgCard,border:`1px solid ${moveTag===m?"transparent":C.border}`,borderRadius:20,padding:"7px 14px",color:moveTag===m?"#fff":C.sub,fontSize:12,fontWeight:700,cursor:"pointer"}}>{m}</button>)}
            </div>
            <button onClick={startLive} className="rec-pulse" style={{width:"100%",background:"linear-gradient(135deg,#FF3B5C,#FF6B6B)",border:"none",borderRadius:16,padding:"16px",color:"#fff",fontWeight:800,fontSize:17,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}><span className="live-flash" style={{fontSize:18}}>●</span> Start Live Now</button>
            <div style={{fontSize:11,color:C.sub,textAlign:"center"}}>Gold Queen+ only · Follow community guidelines</div>
          </div>
        </div>
      )}
      {state==="live"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",position:"relative"}}>
          <div style={{flex:1,background:"#000",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
            <video ref={liveVideoRef} autoPlay muted playsInline style={{width:"100%",height:"100%",objectFit:"cover",transform:"scaleX(-1)"}}/>
            <VideoWatermark/>
            <div style={{position:"absolute",top:0,left:0,right:0,padding:"14px",display:"flex",alignItems:"center",gap:8,background:"linear-gradient(to bottom,rgba(0,0,0,0.75),transparent)"}}>
              <div style={{display:"flex",alignItems:"center",gap:4,background:"rgba(255,59,92,0.9)",borderRadius:10,padding:"5px 10px"}}><span className="live-flash" style={{color:"#fff",fontSize:10}}>●</span><span style={{fontWeight:800,color:"#fff",fontSize:11}}>LIVE</span></div>
              <div style={{background:"rgba(0,0,0,0.5)",borderRadius:10,padding:"5px 10px",fontSize:11,color:"#fff"}}>👁 {viewers.toLocaleString()}</div>
              <div style={{background:"rgba(0,0,0,0.5)",borderRadius:10,padding:"5px 10px",fontSize:11,color:"#fff"}}>⏱ {fmt(elapsed)}</div>
              <div style={{flex:1,fontSize:12,color:"rgba(255,255,255,0.8)",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
              <button onClick={endLive} style={{background:"rgba(255,59,92,0.85)",border:"none",borderRadius:10,padding:"5px 12px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>End</button>
            </div>
            <div style={{position:"absolute",bottom:74,left:14,right:14,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(6px)",borderRadius:10,padding:"7px 10px",fontSize:10.5,color:"rgba(255,255,255,0.75)",lineHeight:1.4}}>
              📹 You're seeing your own camera — the viewer count and comments above are simulated for this preview build, not a real broadcast yet.
            </div>
            <div style={{position:"absolute",right:14,bottom:60,display:"flex",flexDirection:"column",gap:5}}>
              {["❤️","🔥","💃","🍑"].map((e,i)=><div key={i} style={{fontSize:20,animation:`floatY ${1.4+i*.3}s ease-in-out infinite`,animationDelay:`${i*.4}s`}}>{e}</div>)}
            </div>
          </div>
          <div style={{height:200,background:"rgba(14,7,24,0.96)",display:"flex",flexDirection:"column",borderTop:`1px solid ${C.border}`}}>
            <div ref={commRef} style={{flex:1,overflowY:"auto",padding:"8px 14px",display:"flex",flexDirection:"column",gap:4,scrollbarWidth:"none"}}>
              {comments.map(c=><div key={c.id} style={{display:"flex",gap:6,alignItems:"flex-start"}}><span style={{fontSize:11,fontWeight:700,color:c.color,flexShrink:0,minWidth:72,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>@{c.user}</span><span style={{fontSize:12,color:C.text,lineHeight:1.5}}>{c.text}</span></div>)}
            </div>
            <div style={{padding:"8px 12px 24px",display:"flex",gap:8,borderTop:`1px solid ${C.border}`}}>
              <input value={cInput} onChange={e=>setCInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendComment()} placeholder="Say something live... 💬" style={{flex:1,background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:20,padding:"9px 14px",fontSize:13,color:C.text,outline:"none"}}/>
              <button onClick={sendComment} style={{background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:20,padding:"9px 16px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>→</button>
            </div>
          </div>
        </div>
      )}
      {state==="ended"&&(
        <div className="fade-up" style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px",gap:16,textAlign:"center",background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`}}>
          <div style={{fontSize:64}}>🎊</div>
          <Logo size="md"/>
          <div style={{fontFamily:"'Pacifico',cursive",fontSize:24,color:C.text,marginTop:4}}>Live Ended!</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,width:"100%"}}>
            {[["Peak Viewers",viewers,"👁","#4FC3FF"],["Comments",comments.length,"💬",C.purple],["Duration",fmt(elapsed),"⏱",C.green],["Move",moveTag,"💃",C.pink]].map(([l,v,ic,col])=>(
              <div key={l} style={{background:C.bgCard,borderRadius:14,padding:"14px 10px",textAlign:"center",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:18,marginBottom:4}}>{ic}</div><div style={{fontWeight:800,fontSize:16,color:col}}>{v}</div><div style={{fontSize:11,color:C.sub,marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>
          <button onClick={onClose} style={{width:"100%",background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:14,padding:"13px",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",maxWidth:280}}>Back to Shakybum 🍑</button>
        </div>
      )}
    </div>
  );
}

// ── SPLASH ──
function Splash({onDone}) {
  const [step,setStep]=useState(0);
  const steps=[
    {sub:"The #1 women's waist dance community",cta:"Get Started"},
    {sub:"Master Afrobeats, Dancehall, Latin & Belly Dance. Post videos, go Live, create ShakyShorts.",cta:"Next →"},
    {sub:"Request private 🍑 Live Bum sessions, connect safely, and dance your way to Diamond badge.",cta:"Join the Movement 💃"},
  ];
  return (
    <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"space-between",padding:"70px 28px 52px"}}>
      <Logo size="xl"/>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:15,color:C.sub,lineHeight:1.75,maxWidth:290,margin:"0 auto 24px"}}>{steps[step].sub}</div>
        <div style={{display:"flex",justifyContent:"center",gap:8}}>
          {steps.map((_,i)=><div key={i} style={{width:i===step?28:8,height:8,borderRadius:4,background:i===step?"linear-gradient(90deg,#FF3CAC,#A855F7)":C.border,transition:"all .35s"}}/>)}
        </div>
      </div>
      <button onClick={()=>step<2?setStep(step+1):onDone()} style={{width:"100%",maxWidth:340,background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:14,padding:"13px 20px",fontWeight:700,fontSize:14,cursor:"pointer",color:"#fff"}}>{steps[step].cta}</button>
    </div>
  );
}

// ── ROOT APP ──
function Bubbles() {
  const emojis = ["💃","🍑","🌀","✨","🔥","💫","⚡","🎵"];
  return (
    <div style={{position:"fixed",inset:0,overflow:"hidden",pointerEvents:"none",zIndex:0}}>
      {emojis.map((e,i)=>(
        <div key={i} style={{
          position:"absolute",
          left:`${10+i*11}%`,
          bottom:"-40px",
          fontSize:`${14+i%3*4}px`,
          opacity:0.12,
          animation:`floatBubble ${8+i*1.2}s linear infinite`,
          animationDelay:`${i*1.1}s`,
        }}>{e}</div>
      ))}
    </div>
  );
}

// ── INPUT FIELD ──
function Field({label,type="text",value,onChange,placeholder,error,icon,rightEl}) {
  const [show,setShow]=useState(false);
  const actualType = type==="password"&&show?"text":type;
  return (
    <div style={{marginBottom:14}}>
      {label&&<div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:6,letterSpacing:.3}}>{label}</div>}
      <div style={{position:"relative"}}>
        {icon&&<div style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:18,pointerEvents:"none"}}>{icon}</div>}
        <input
          type={actualType}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          style={{
            width:"100%",
            background:error?`rgba(255,59,92,0.08)`:C.bgCard,
            border:`1.5px solid ${error?"rgba(255,59,92,0.5)":value?C.borderH:C.border}`,
            borderRadius:14,
            padding:`13px ${type==="password"?"48px":"16px"} 13px ${icon?"44px":"16px"}`,
            fontSize:15,
            color:C.text,
            outline:"none",
            boxSizing:"border-box",
            transition:"border-color .2s",
          }}
        />
        {type==="password"&&(
          <button onClick={()=>setShow(!show)} type="button" style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:C.sub,padding:0}}>
            {show?"🙈":"👁"}
          </button>
        )}
        {rightEl&&<div style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)"}}>{rightEl}</div>}
      </div>
      {error&&<div style={{fontSize:11,color:"#FF3B5C",marginTop:5,fontWeight:600}}>⚠ {error}</div>}
    </div>
  );
}

// ── SOCIAL BUTTON ──
function SocialBtn({icon,label,onClick}) {
  return (
    <button onClick={onClick} style={{width:"100%",background:C.bgCard,border:`1.5px solid ${C.border}`,borderRadius:14,padding:"13px",display:"flex",alignItems:"center",justifyContent:"center",gap:10,cursor:"pointer",fontSize:14,fontWeight:600,color:C.text,transition:"border-color .2s"}}>
      <span style={{fontSize:20}}>{icon}</span> {label}
    </button>
  );
}

// Strength indicator
function PasswordStrength({pwd}) {
  if(!pwd) return null;
  const score = [pwd.length>=8, /[A-Z]/.test(pwd), /[0-9]/.test(pwd), /[^A-Za-z0-9]/.test(pwd)].filter(Boolean).length;
  const labels=["Weak","Fair","Good","Strong"];
  const colors=["#FF3B5C","#FF9A76","#FFD700","#00E5A0"];
  return (
    <div style={{marginBottom:14}}>
      <div style={{display:"flex",gap:4,marginBottom:4}}>
        {[0,1,2,3].map(i=><div key={i} style={{flex:1,height:4,borderRadius:2,background:i<score?colors[score-1]:C.border,transition:"background .3s"}}/>)}
      </div>
      <div style={{fontSize:11,color:colors[score-1]||C.sub,fontWeight:600}}>{score>0?labels[score-1]:"Enter a password"}</div>
    </div>
  );
}

// OTP Input
function OTPInput({value,onChange}) {
  const refs=[useRef(),useRef(),useRef(),useRef(),useRef(),useRef()];
  const digits=value.split("").concat(Array(6).fill("")).slice(0,6);
  const handleChange=(i,v)=>{
    const clean=v.replace(/\D/,"");
    const arr=[...digits];arr[i]=clean;
    const newVal=arr.join("").slice(0,6);
    onChange(newVal);
    if(clean&&i<5)refs[i+1].current?.focus();
  };
  const handleKey=(i,e)=>{
    if(e.key==="Backspace"&&!digits[i]&&i>0)refs[i-1].current?.focus();
  };
  return (
    <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:20}}>
      {digits.map((d,i)=>(
        <input key={i} ref={refs[i]} maxLength={1} value={d} onChange={e=>handleChange(i,e.target.value)} onKeyDown={e=>handleKey(i,e)}
          style={{width:46,height:56,borderRadius:14,background:C.bgCard,border:`1.5px solid ${d?C.pink:C.border}`,textAlign:"center",fontSize:22,fontWeight:700,color:C.text,outline:"none",transition:"border-color .2s"}}/>
      ))}
    </div>
  );
}

// ── WELCOME SCREEN ──
function WelcomeScreen({onLogin,onSignup,onGuest}) {
  return (
    <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at top,#2e0a40 0%,${C.bg} 60%)`,display:"flex",flexDirection:"column",alignItems:"center",position:"relative",overflow:"hidden"}}>
      <Bubbles/>
      <div style={{position:"relative",zIndex:1,flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"60px 28px 0",textAlign:"center"}}>
        <div style={{marginBottom:24}}><Logo size="xl"/></div>
        <div style={{fontFamily:"'Pacifico',cursive",fontSize:20,color:C.sub,marginBottom:10}}>Dance. Twist. Shine.</div>
        <div style={{fontSize:14,color:C.sub,lineHeight:1.75,maxWidth:300,marginBottom:32}}>
          The #1 community for women's waist dance moves. Join thousands of queens worldwide 💃🌍
        </div>
        {/* Feature pills */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",marginBottom:40}}>
          {["🌀 Afrobeats","💃 Dancehall","🔥 Latin","✨ Belly Dance","⚡ ShakyShorts","🔴 Live","🍑 Live Bum Sessions"].map(f=>(
            <span key={f} style={{background:`rgba(255,60,172,0.1)`,border:`1px solid ${C.borderH}`,borderRadius:20,padding:"5px 12px",fontSize:11,fontWeight:600,color:C.pink}}>{f}</span>
          ))}
        </div>
      </div>
      <div style={{position:"relative",zIndex:1,width:"100%",padding:"0 24px 52px",display:"flex",flexDirection:"column",gap:12}}>
        <button onClick={onSignup} style={{width:"100%",background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:16,padding:"16px",color:"#fff",fontWeight:800,fontSize:17,cursor:"pointer",boxShadow:"0 8px 28px rgba(255,60,172,0.4)"}}>
          Create Account 🍑
        </button>
        <button onClick={onLogin} style={{width:"100%",background:"transparent",border:`2px solid ${C.pink}`,borderRadius:16,padding:"15px",color:C.pink,fontWeight:800,fontSize:17,cursor:"pointer"}}>
          Sign In
        </button>
        <button onClick={onGuest} style={{width:"100%",background:"none",border:"none",padding:"12px",color:C.sub,fontWeight:600,fontSize:14,cursor:"pointer",textDecoration:"underline",textDecorationColor:`rgba(139,122,168,0.4)`}}>
          Browse as Guest →
        </button>
        <div style={{fontSize:11,color:C.sub,textAlign:"center",lineHeight:1.6,marginTop:4}}>
          By continuing you agree to our <span style={{color:C.pink,cursor:"pointer"}}>Terms of Service</span> and <span style={{color:C.pink,cursor:"pointer"}}>Privacy Policy</span>
        </div>
      </div>
    </div>
  );
}

// ── LOGIN SCREEN ──
function LoginScreen({onBack,onSuccess,onForgot,showToast}) {
  const [email,setEmail]=useState("");
  const [pwd,setPwd]=useState("");
  const [loading,setLoading]=useState(false);
  const [errors,setErrors]=useState({});
  const [shakeKey,setShakeKey]=useState(0);

  const validate=()=>{
    const e={};
    if(!email.trim()) e.email="Email is required";
    else if(!/\S+@\S+\.\S+/.test(email)) e.email="Enter a valid email address";
    if(!pwd) e.pwd="Password is required";
    else if(pwd.length<6) e.pwd="Password must be at least 6 characters";
    return e;
  };

  const handleLogin=async()=>{
    const e=validate();
    if(Object.keys(e).length){setErrors(e);setShakeKey(k=>k+1);return;}
    setLoading(true);setErrors({});
    try{
      const {token,user}=await api.auth.login({email,password:pwd});
      setToken(token);
      onSuccess(user);
    }catch(err){
      setLoading(false);
      setErrors({pwd:err.message||"Login failed"});
      setShakeKey(k=>k+1);
    }
  };

  return (
    <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`,display:"flex",flexDirection:"column"}}>
      <Bubbles/>
      <div style={{position:"relative",zIndex:1,padding:"52px 24px 0",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onBack} style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,width:40,height:40,cursor:"pointer",fontSize:18,color:C.text,flexShrink:0}}>←</button>
        <Logo size="sm"/>
      </div>
      <div style={{position:"relative",zIndex:1,flex:1,display:"flex",flexDirection:"column",justifyContent:"center",padding:"24px 24px 40px"}}>
        <div className="fade-up">
          <div style={{fontFamily:"'Pacifico',cursive",fontSize:28,color:C.text,marginBottom:6}}>Welcome back 👋</div>
          <div style={{fontSize:14,color:C.sub,marginBottom:28}}>Sign in to continue dancing</div>

          <div key={shakeKey} className={shakeKey?"shake":""}>
            <Field label="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com" error={errors.email} icon="📧"/>
            <Field label="Password" type="password" value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="Enter your password" error={errors.pwd} icon="🔒"/>
          </div>

          <div style={{textAlign:"right",marginBottom:20,marginTop:-8}}>
            <button onClick={onForgot} style={{background:"none",border:"none",color:C.pink,fontSize:13,fontWeight:700,cursor:"pointer"}}>Forgot password?</button>
          </div>

          <button onClick={handleLogin} disabled={loading} style={{width:"100%",background:loading?"rgba(255,60,172,0.4)":"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:16,padding:"16px",color:"#fff",fontWeight:800,fontSize:17,cursor:loading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:20,boxShadow:loading?"none":"0 8px 28px rgba(255,60,172,0.35)"}}>
            {loading?<><div style={{width:20,height:20,borderRadius:"50%",border:"3px solid rgba(255,255,255,0.3)",borderTop:"3px solid #fff",animation:"spinRing 1s linear infinite"}}/> Signing in...</>:"Sign In 🍑"}
          </button>

          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
            <div style={{flex:1,height:1,background:C.border}}/><span style={{fontSize:12,color:C.sub,flexShrink:0}}>or continue with</span><div style={{flex:1,height:1,background:C.border}}/>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {/* Social login isn't backed by anything server-side yet — no OAuth
                flow exists on the backend. Faking success here would create a
                logged-in session with no real account, so these are disabled
                with an honest message instead of a fake happy path. */}
            <SocialBtn icon="🇬" label="Continue with Google" onClick={()=>showToast?.("Google sign-in coming soon — use email for now")}/>
            <SocialBtn icon="🍎" label="Continue with Apple" onClick={()=>showToast?.("Apple sign-in coming soon — use email for now")}/>
            <SocialBtn icon="📘" label="Continue with Facebook" onClick={()=>showToast?.("Facebook sign-in coming soon — use email for now")}/>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SIGNUP SCREEN ──
function SignupScreen({onBack,onSuccess,onLogin,showToast}) {
  const [step,setStep]=useState(1); // 1=details, 2=verify (cosmetic — no real backend OTP), 3=profile
  const [form,setForm]=useState({name:"",handle:"",email:"",pwd:"",confirmPwd:"",dob:"",otp:""});
  const [errors,setErrors]=useState({});
  const [loading,setLoading]=useState(false);
  const [shakeKey,setShakeKey]=useState(0);
  const [handleAvail,setHandleAvail]=useState(null);
  const [handleFlag,setHandleFlag]=useState(null); // {flagged,reason} from scanContactInfo
  const [handleSuggestions,setHandleSuggestions]=useState([]);
  const [createdUser,setCreatedUser]=useState(null); // set once the real account exists (after step1)
  const handleRef=useRef(null);

  const set=k=>v=>setForm(p=>({...p,[k]:v}));

  // Live availability check hits the real backend the moment they stop
  // typing — the actual authoritative check still happens at signup time
  // (handled via the 409 branch in handleStep1), since a handle could be
  // taken by someone else between this check and submission.
  useEffect(()=>{
    clearTimeout(handleRef.current);
    if(!form.handle||form.handle.length<3){setHandleAvail(null);setHandleFlag(null);setHandleSuggestions([]);return;}
    const flag=scanContactInfo(form.handle);
    setHandleFlag(flag.flagged?flag:null);
    if(flag.flagged){setHandleAvail(null);setHandleSuggestions(suggestHandles(form.handle));return;}
    handleRef.current=setTimeout(async()=>{
      try{
        // No public unauthenticated "is handle taken" endpoint exists, so this
        // piggybacks on the fact that GET /users/:handle 404s if free. It
        // requires *some* auth token — if the browser has a stale token from
        // a previous session, this still works fine (404 vs found is what matters).
        await api.users.get(form.handle);
        setHandleAvail(false);
        setHandleSuggestions(suggestHandles(form.handle));
      }catch(err){
        if(err.status===404){setHandleAvail(true);setHandleSuggestions([]);}
        else{setHandleAvail(null);} // couldn't check (not logged in yet, network issue) — fall back to letting signup itself catch a collision
      }
    },600);
  },[form.handle]);

  const validateStep1=()=>{
    const e={};
    if(!form.name.trim()) e.name="Name is required";
    if(!form.handle.trim()) e.handle="Username is required";
    else if(form.handle.length<3) e.handle="Username must be at least 3 characters";
    else if(!/^[a-zA-Z0-9_]+$/.test(form.handle)) e.handle="Letters, numbers and _ only";
    else if(scanContactInfo(form.handle).flagged) e.handle="Usernames can't contain contact info";
    if(!form.email.trim()) e.email="Email is required";
    else if(!/\S+@\S+\.\S+/.test(form.email)) e.email="Enter a valid email";
    if(!form.pwd) e.pwd="Password is required";
    else if(form.pwd.length<8) e.pwd="At least 8 characters";
    if(form.pwd!==form.confirmPwd) e.confirmPwd="Passwords don't match";
    if(!form.dob) e.dob="Date of birth is required";
    else {
      const age=(new Date()-new Date(form.dob))/(1000*60*60*24*365.25);
      if(age<13) e.dob="You must be at least 13 to join Shakybum";
    }
    return e;
  };

  const handleStep1=async()=>{
    const e=validateStep1();
    if(Object.keys(e).length){setErrors(e);setShakeKey(k=>k+1);return;}
    setLoading(true);setErrors({});
    try{
      // The real account is created HERE, not at the end of the wizard —
      // step 2 (OTP) and step 3 (style picker) are cosmetic beyond this point.
      const {token,user}=await api.auth.signup({email:form.email,password:form.pwd,handle:form.handle,name:form.name});
      setToken(token);
      setCreatedUser(user);
      setLoading(false);
      setStep(2);
    }catch(err){
      setLoading(false);
      const field=/email/i.test(err.message)?"email":/handle|username/i.test(err.message)?"handle":"pwd";
      setErrors({[field]:err.message});
      setShakeKey(k=>k+1);
    }
  };

  const handleStep2=()=>{
    if(form.otp.length<6){setErrors({otp:"Enter all 6 digits"});return;}
    setLoading(true);setErrors({});
    setTimeout(()=>{setLoading(false);setStep(3);},1000);
  };

  const handleStep3=()=>{
    onSuccess(createdUser);
  };

  const handleAvailIcon=handleAvail===null?null:handleAvail?<span style={{color:C.green,fontSize:14,fontWeight:700}}>✓</span>:<span style={{color:"#FF3B5C",fontSize:14}}>✗</span>;

  return (
    <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`,display:"flex",flexDirection:"column"}}>
      <Bubbles/>
      <div style={{position:"relative",zIndex:1,padding:"52px 24px 0",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={step===1?onBack:()=>setStep(step-1)} style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,width:40,height:40,cursor:"pointer",fontSize:18,color:C.text,flexShrink:0}}>←</button>
        <Logo size="sm"/>
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          {[1,2,3].map(s=><div key={s} style={{width:s<=step?24:8,height:8,borderRadius:4,background:s<=step?"linear-gradient(90deg,#FF3CAC,#A855F7)":C.border,transition:"all .35s"}}/>)}
        </div>
      </div>

      <div style={{position:"relative",zIndex:1,flex:1,display:"flex",flexDirection:"column",padding:"20px 24px 40px",overflowY:"auto"}}>

        {/* STEP 1 — Details */}
        {step===1&&(
          <div className="fade-up">
            <div style={{fontFamily:"'Pacifico',cursive",fontSize:26,color:C.text,marginBottom:4}}>Join Shakybum 💃</div>
            <div style={{fontSize:13,color:C.sub,marginBottom:24}}>Create your free account and start dancing!</div>
            <div key={shakeKey} className={shakeKey?"shake":""}>
              <Field label="Full Name" value={form.name} onChange={e=>set("name")(e.target.value)} placeholder="Your name" error={errors.name} icon="👤"/>
              <Field label="Username" value={form.handle} onChange={e=>set("handle")(e.target.value.toLowerCase().replace(/\s/,""))} placeholder="e.g. queenofwine" error={errors.handle} icon="@"
                rightEl={handleAvailIcon}/>
              {handleAvail===false&&<div style={{fontSize:11,color:"#FF3B5C",marginTop:-10,marginBottom:10,fontWeight:600}}>Username taken — try another</div>}
              {handleAvail===true&&<div style={{fontSize:11,color:C.green,marginTop:-10,marginBottom:10,fontWeight:600}}>✓ Username available!</div>}
              {handleFlag&&(
                <div style={{marginTop:-10,marginBottom:10}}>
                  <div style={{fontSize:11,color:"#FF3B5C",fontWeight:600,marginBottom:6}}>⚠ Usernames can't include {handleFlag.reason} — contact details stay private until a paid request is approved.</div>
                </div>
              )}
              {handleSuggestions.length>0&&(handleAvail===false||handleFlag)&&(
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:-4,marginBottom:14}}>
                  {handleSuggestions.map(s=>(
                    <button key={s} type="button" onClick={()=>set("handle")(s)} style={{background:C.bgAlt,border:`1px solid ${C.border}`,borderRadius:10,padding:"6px 11px",color:C.purple,fontWeight:700,fontSize:12,cursor:"pointer"}}>{s}</button>
                  ))}
                </div>
              )}
              <Field label="Email Address" type="email" value={form.email} onChange={e=>set("email")(e.target.value)} placeholder="your@email.com" error={errors.email} icon="📧"/>
              <Field label="Date of Birth" type="date" value={form.dob} onChange={e=>set("dob")(e.target.value)} error={errors.dob} icon="🎂"/>
              <Field label="Password" type="password" value={form.pwd} onChange={e=>set("pwd")(e.target.value)} placeholder="Min 8 characters" error={errors.pwd} icon="🔒"/>
              <PasswordStrength pwd={form.pwd}/>
              <Field label="Confirm Password" type="password" value={form.confirmPwd} onChange={e=>set("confirmPwd")(e.target.value)} placeholder="Repeat your password" error={errors.confirmPwd} icon="🔒"/>
            </div>
            <div style={{background:C.bgCard,borderRadius:14,padding:"12px 14px",border:`1px solid ${C.border}`,marginBottom:12,fontSize:12,color:C.sub,lineHeight:1.6}}>
              🔒 Your account is protected. Contact details are always hidden by default and only shared with your approval.
            </div>
            <div style={{background:C.redL,borderRadius:14,padding:"12px 14px",border:`1px solid ${C.red}44`,marginBottom:20,fontSize:12,color:C.sub,lineHeight:1.6}}>
              ⚠️ <b style={{color:C.text}}>Sharing contact info anywhere on Shakybum results in a permanent ban.</b> Use Contact Requests to connect safely.
            </div>
            <button onClick={handleStep1} disabled={loading} style={{width:"100%",background:loading?"rgba(255,60,172,0.4)":"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:16,padding:"16px",color:"#fff",fontWeight:800,fontSize:17,cursor:loading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,boxShadow:loading?"none":"0 8px 28px rgba(255,60,172,0.35)"}}>
              {loading?<><div style={{width:20,height:20,borderRadius:"50%",border:"3px solid rgba(255,255,255,0.3)",borderTop:"3px solid #fff",animation:"spinRing 1s linear infinite"}}/> Checking...</>:"Continue →"}
            </button>
            <div style={{textAlign:"center",marginTop:16,fontSize:13,color:C.sub}}>
              Already have an account? <button onClick={onLogin} style={{background:"none",border:"none",color:C.pink,fontWeight:700,cursor:"pointer",fontSize:13}}>Sign in</button>
            </div>
          </div>
        )}

        {/* STEP 2 — OTP Verify */}
        {step===2&&(
          <div className="fade-up">
            <div style={{textAlign:"center",marginBottom:24}}>
              <div style={{fontSize:56,marginBottom:12}}>📬</div>
              <div style={{fontFamily:"'Pacifico',cursive",fontSize:24,color:C.text,marginBottom:6}}>Check your email</div>
              <div style={{fontSize:14,color:C.sub,lineHeight:1.6}}>We sent a 6-digit code to<br/><b style={{color:C.text}}>{form.email}</b></div>
            </div>
            <OTPInput value={form.otp} onChange={set("otp")}/>
            {errors.otp&&<div style={{fontSize:11,color:"#FF3B5C",textAlign:"center",marginBottom:12,fontWeight:600}}>⚠ {errors.otp}</div>}
            <button onClick={handleStep2} disabled={loading||form.otp.length<6} style={{width:"100%",background:form.otp.length<6?"rgba(168,85,247,0.15)":"linear-gradient(135deg,#FF3CAC,#A855F7)",border:`1px solid ${form.otp.length<6?C.border:"transparent"}`,borderRadius:16,padding:"16px",color:form.otp.length<6?C.sub:"#fff",fontWeight:800,fontSize:17,cursor:form.otp.length<6?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:16}}>
              {loading?<><div style={{width:20,height:20,borderRadius:"50%",border:"3px solid rgba(255,255,255,0.3)",borderTop:"3px solid #fff",animation:"spinRing 1s linear infinite"}}/> Verifying...</>:"Verify Email ✓"}
            </button>
            <div style={{textAlign:"center"}}>
              <button onClick={()=>{}} style={{background:"none",border:"none",color:C.purple,fontSize:13,fontWeight:600,cursor:"pointer"}}>Resend code</button>
              <span style={{color:C.sub,fontSize:13}}> · Expires in 10 min</span>
            </div>
            <div style={{background:C.bgCard,borderRadius:14,padding:"12px 14px",border:`1px solid ${C.border}`,marginTop:16,fontSize:12,color:C.sub}}>
              💡 For demo: enter any 6 digits to continue
            </div>
          </div>
        )}

        {/* STEP 3 — Pick dance style */}
        {step===3&&(
          <div className="fade-up">
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:56,marginBottom:8}}>💃</div>
              <div style={{fontFamily:"'Pacifico',cursive",fontSize:24,color:C.text,marginBottom:6}}>One last thing!</div>
              <div style={{fontSize:14,color:C.sub,lineHeight:1.6}}>What's your vibe? Pick your dance styles so we can personalise your feed.</div>
            </div>
            <StylePicker/>
            <div style={{marginTop:20}}>
              <button onClick={handleStep3} disabled={loading} style={{width:"100%",background:loading?"rgba(255,60,172,0.4)":"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:16,padding:"16px",color:"#fff",fontWeight:800,fontSize:17,cursor:loading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,boxShadow:loading?"none":"0 8px 28px rgba(255,60,172,0.35)"}}>
                {loading?<><div style={{width:20,height:20,borderRadius:"50%",border:"3px solid rgba(255,255,255,0.3)",borderTop:"3px solid #fff",animation:"spinRing 1s linear infinite"}}/> Creating account...</>:"Let's Dance! 🍑"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Dance style picker for signup step 3
function StylePicker() {
  const [selected,setSelected]=useState(["Afrobeats"]);
  const styles=[
    {name:"Afrobeats", emoji:"🌍", color:"#FF3CAC"},
    {name:"Dancehall",  emoji:"🎵", color:"#A855F7"},
    {name:"Latin",      emoji:"🔥", color:"#FF9A76"},
    {name:"Belly Dance",emoji:"✨", color:"#4CC9F0"},
    {name:"Hip Hop",    emoji:"🎤", color:"#F72585"},
    {name:"Waist Wine", emoji:"🌀", color:"#FFD700"},
    {name:"Soca",       emoji:"🌴", color:"#00E5A0"},
    {name:"Twerking",   emoji:"💃", color:"#7FFF00"},
  ];
  const toggle=n=>setSelected(p=>p.includes(n)?p.filter(x=>x!==n):[...p,n]);
  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      {styles.map(s=>{
        const on=selected.includes(s.name);
        return (
          <div key={s.name} onClick={()=>toggle(s.name)} style={{background:on?`${s.color}22`:C.bgCard,border:`1.5px solid ${on?s.color:C.border}`,borderRadius:14,padding:"14px 12px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",transition:"all .2s"}}>
            <div style={{width:36,height:36,borderRadius:10,background:`${s.color}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{s.emoji}</div>
            <div>
              <div style={{fontWeight:700,fontSize:13,color:on?s.color:C.text}}>{s.name}</div>
              {on&&<div style={{fontSize:10,color:s.color,fontWeight:600}}>✓ Selected</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── FORGOT PASSWORD SCREEN ──
function ForgotScreen({onBack,onSuccess}) {
  const [email,setEmail]=useState("");
  const [sent,setSent]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  const handleSend=()=>{
    if(!email.trim()||!/\S+@\S+\.\S+/.test(email)){setError("Enter a valid email address");return;}
    setError("");setLoading(true);
    setTimeout(()=>{setLoading(false);setSent(true);},1400);
  };

  return (
    <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`,display:"flex",flexDirection:"column"}}>
      <Bubbles/>
      <div style={{position:"relative",zIndex:1,padding:"52px 24px 0",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onBack} style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,width:40,height:40,cursor:"pointer",fontSize:18,color:C.text}}>←</button>
        <Logo size="sm"/>
      </div>
      <div style={{position:"relative",zIndex:1,flex:1,display:"flex",flexDirection:"column",justifyContent:"center",padding:"24px 24px 40px"}}>
        {!sent?(
          <div className="fade-up">
            <div style={{textAlign:"center",marginBottom:24}}>
              <div style={{fontSize:56,marginBottom:12}}>🔑</div>
              <div style={{fontFamily:"'Pacifico',cursive",fontSize:24,color:C.text,marginBottom:6}}>Reset Password</div>
              <div style={{fontSize:14,color:C.sub,lineHeight:1.6}}>Enter your email and we'll send you a reset link</div>
            </div>
            <Field label="Email Address" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com" error={error} icon="📧"/>
            <button onClick={handleSend} disabled={loading} style={{width:"100%",background:loading?"rgba(255,60,172,0.4)":"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:16,padding:"16px",color:"#fff",fontWeight:800,fontSize:17,cursor:loading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginTop:8}}>
              {loading?<><div style={{width:20,height:20,borderRadius:"50%",border:"3px solid rgba(255,255,255,0.3)",borderTop:"3px solid #fff",animation:"spinRing 1s linear infinite"}}/> Sending...</>:"Send Reset Link 📬"}
            </button>
          </div>
        ):(
          <div className="fade-up" style={{textAlign:"center"}}>
            <div style={{fontSize:64,marginBottom:16}}>✅</div>
            <div style={{fontFamily:"'Pacifico',cursive",fontSize:24,color:C.text,marginBottom:8}}>Check your inbox!</div>
            <div style={{fontSize:14,color:C.sub,lineHeight:1.7,marginBottom:28}}>We sent a reset link to<br/><b style={{color:C.text}}>{email}</b><br/>The link expires in 15 minutes.</div>
            <button onClick={onBack} style={{width:"100%",background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:16,padding:"16px",color:"#fff",fontWeight:800,fontSize:17,cursor:"pointer"}}>Back to Sign In</button>
          </div>
        )}
      </div>
    </div>
  );
}


function MainApp() {
  const [onboarded,setOnboarded]=useState(false);
  const [tab,setTab]=useState(0);
  const [liked,setLiked]=useState({});
  const [posts,setPosts]=useState(INIT_POSTS);
  const [shorts,setShorts]=useState(INIT_SHORTS);
  // users/contactRequests/bumRequests/notifs are now loaded from the real
  // backend (see loadCoreData below) — posts/shorts above stay mock, since
  // the content/social layer wasn't part of this wiring pass (see PR notes).
  const [users,setUsers]=useState([]);
  const [dataLoading,setDataLoading]=useState(true);
  const [dataError,setDataError]=useState(null);
  const [following,setFollowing]=useState([]);
  const [contactRequests,setContactRequests]=useState({sent:[],received:[]});
  const [approvedContacts,setApprovedContacts]=useState([]);
  const [bumRequests,setBumRequests]=useState({sent:[],received:[]});
  const [approvedBum,setApprovedBum]=useState([]);
  const [activeBumSession,setActiveBumSession]=useState(null); // {id,mins,remainingSec,extensions}
  const [notifs,setNotifs]=useState([]);
  const [toast,setToast]=useState(null);
  const [profileUser,setProfileUser]=useState(null);
  const [profileVideoUser,setProfileVideoUser]=useState(null);
  const [showUpload,setShowUpload]=useState(null);
  const [meVersion,setMeVersion]=useState(0); // bumped after mutating ME in place (e.g. profile video), forces reads of ME to re-render
  const [showLive,setShowLive]=useState(false);
  const [showNotifs,setShowNotifs]=useState(false);
  const [showAdmin,setShowAdmin]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [showPrivacy,setShowPrivacy]=useState(false);
  const [showHelp,setShowHelp]=useState(false);
  const [showMyVideos,setShowMyVideos]=useState(false);
  const [showSavedMoves,setShowSavedMoves]=useState(false);
  const [showMyChallenges,setShowMyChallenges]=useState(false);
  const [showContactReqs,setShowContactReqs]=useState(false);
  const [momoTarget,setMomoTarget]=useState(null); // {user, kind:'contact'|'bum'} — item currently being paid for
  const [chats,setChats]=useState({}); // {userId: [{id,from,text,time}]} — cache of fetched messages, refetched per-open
  const [chatUser,setChatUser]=useState(null); // user currently open in ChatScreen
  const toastRef=useRef(null);

  // Maps backend contact-request/bum-session shape (creatorId/payerId as raw
  // ids) into the {sent:[...], received:[...]} shape the existing UI
  // components expect, using the fetched `users` list (+ ME) to resolve ids
  // to full user objects for display.
  const resolveUser=(id,usersList)=>id===ME.id?ME:(usersList.find(u=>u.id===id)||{id,name:"Unknown",handle:"",badge:"Newcomer"});

  const loadCoreData=async(usersOverride)=>{
    try{
      const [usersRes,crSent,crReceived,bsSent,bsReceived,bsActive,notifsRes,postsRes,shortsRes]=await Promise.all([
        usersOverride?Promise.resolve({users:usersOverride}):api.users.list(),
        api.contactRequests.sent(),api.contactRequests.received(),
        api.bumSessions.sent(),api.bumSessions.received(),api.bumSessions.active(),
        api.notifications.list(),
        api.posts.feed("post"),api.posts.feed("short"),
      ]);
      const mappedUsers=usersOverride||usersRes.users.map(mapUser);
      setUsers(mappedUsers);
      setPosts(postsRes.posts.map(mapPost));
      setShorts(shortsRes.posts.map(mapPost));

      const approved=crSent.requests.filter(r=>r.status==="approved").map(r=>r.creatorId);
      setApprovedContacts(approved);
      setContactRequests({
        sent:crSent.requests.filter(r=>["pending","paid_hold"].includes(r.status)).map(r=>r.creatorId),
        received:crReceived.requests.map(r=>r.creatorId),
      });

      const approvedB=bsActive.sessions.map(s=>({id:s.creatorId===ME.id?s.payerId:s.creatorId,mins:s.mins,_backendId:s.id,_status:s.status}));
      setApprovedBum(approvedB);
      setBumRequests({
        sent:bsSent.sessions?.filter(r=>["pending","paid_hold"].includes(r.status)).map(r=>({id:r.creatorId,mins:r.mins}))||[],
        received:bsReceived.sessions.map(r=>({id:r.payerId,mins:r.mins,_backendId:r.id})),
      });

      setNotifs(notifsRes.notifications.map(n=>({id:n.id,type:n.type,msg:n.text,time:timeAgo(n.createdAt),read:n.read,user:ME})));
      setDataError(null);
    }catch(err){
      setDataError(err.message||"Couldn't load your data");
    }finally{
      setDataLoading(false);
    }
  };

  useEffect(()=>{ loadCoreData(); },[]);

  const showToast=msg=>{setToast(msg);clearTimeout(toastRef.current);toastRef.current=setTimeout(()=>setToast(null),3200);};

  // openProfile opens the full profile video modal
  const openProfile=user=>{setProfileVideoUser(user);};

  // requestContact/requestBum open the MoMo payment sheet; the actual charge
  // + webhook-confirmation polling happens in momoOnSubmit below, wired to
  // MomoPaymentModal's onSubmit prop.
  const requestContact=user=>{setMomoTarget({user,kind:"contact"});};
  const requestBum=(user,mins)=>{setMomoTarget({user,kind:"bum",mins});};

  const momoOnSubmit=async(phone,provider)=>{
    if(!momoTarget)return;
    if(momoTarget.kind==="contact"){
      const{contactRequest}=await api.contactRequests.initiate({creatorHandle:momoTarget.user.handle,phone,provider});
      const final=await pollUntil(()=>api.contactRequests.get(contactRequest.id),r=>r.contactRequest.status!=="pending");
      if(final.contactRequest.status!=="paid_hold")throw new Error("Payment wasn't confirmed by your network — try again.");
    }else if(momoTarget.kind==="bum"){
      const{bumSession}=await api.bumSessions.initiate({creatorHandle:momoTarget.user.handle,mins:momoTarget.mins,phone,provider});
      const final=await pollUntil(()=>api.bumSessions.get(bumSession.id),r=>r.bumSession.status!=="pending");
      if(final.bumSession.status!=="paid_hold")throw new Error("Payment wasn't confirmed by your network — try again.");
    }else if(momoTarget.kind==="bum-extend"){
      const beforeExt=activeBumSession?.extensions??0;
      const{extension}=await api.bumSessions.extend(momoTarget.bumSessionBackendId,{phone,provider});
      const final=await pollUntil(()=>api.bumSessions.get(momoTarget.bumSessionBackendId),r=>r.bumSession.extensions>beforeExt||r.bumSession.status==="active"&&r.bumSession.extensions>beforeExt,{timeoutMs:45000});
      setActiveBumSession(s=>s?{...s,remainingSec:final.bumSession.remainingSec,extensions:final.bumSession.extensions}:s);
    }
  };
  const momoOnSuccess=async()=>{
    const u=momoTarget?.user;
    const kind=momoTarget?.kind;
    setMomoTarget(null);
    if(kind==="contact")showToast(`Payment held in escrow — request sent to ${u.name}! 📬`);
    else if(kind==="bum")showToast(`Payment held in escrow — ${momoTarget.mins}-min session request sent to ${u.name}! 🍑`);
    else if(kind==="bum-extend")showToast(`+15 min added! 🍑⏱️`);
    await loadCoreData(users); // resync sent/received/approved lists from backend, reuse already-fetched users list
  };

  // openChat fetches the real message history — only reachable for users
  // already in approvedContacts (enforced at the call sites, UserSheet/
  // ContactRequestsScreen), matching the backend's own 403 if bypassed.
  const openChat=async user=>{
    setChatUser(user);
    try{
      const{messages}=await api.chat.messages(user.id);
      setChats(p=>({...p,[user.id]:messages.map(m=>({id:m.id,from:m.senderId===ME.id?"me":"them",text:m.text,time:new Date(m.createdAt.replace(" ","T")+"Z").toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}))}));
    }catch(err){
      showToast(err.message||"Couldn't load messages");
    }
  };
  const sendMessage=async text=>{
    if(!chatUser)return;
    try{
      const{message}=await api.chat.send(chatUser.id,text);
      setChats(p=>({...p,[chatUser.id]:[...(p[chatUser.id]||[]),{id:message.id,from:"me",text:message.text,time:new Date(message.createdAt.replace(" ","T")+"Z").toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}]}));
    }catch(err){
      showToast(err.message||"Message couldn't be sent");
    }
  };
  const blockChat=()=>{
    // No report/block endpoint exists on the backend yet — this still
    // updates local UI state so the flow doesn't dead-end, but it does NOT
    // persist server-side. Flagging clearly rather than pretending it's real.
    if(!chatUser)return;
    setApprovedContacts(p=>p.filter(x=>x!==chatUser.id));
    showToast(`${chatUser.name} blocked locally — server-side report/block isn't built yet 🚫`);
    setChatUser(null);
  };

  // Single ticking interval for the active Live Bum session — restarts only when the
  // session identity changes (start/end), not on every second, so extensions just
  // update the shared remainingSec value the interval is already reading. The
  // backend is the source of truth (computed from startedAt+totalSec, not
  // ticked server-side either — see backend/src/lib/bumTime.js) — this local
  // tick just keeps the UI smooth between the real values fetched on
  // start/extend, and will drift slightly until the next real fetch.
  useEffect(()=>{
    if(!activeBumSession)return;
    const iv=setInterval(()=>{
      setActiveBumSession(s=>{
        if(!s)return s;
        if(s.remainingSec<=0)return s;
        return{...s,remainingSec:s.remainingSec-1};
      });
    },1000);
    return()=>clearInterval(iv);
  },[activeBumSession?.id]);

  const startBumSession=async sess=>{
    try{
      const{bumSession}=await api.bumSessions.start(sess._backendId);
      setActiveBumSession({id:sess.id,mins:sess.mins,remainingSec:bumSession.remainingSec,extensions:bumSession.extensions,_backendId:sess._backendId});
    }catch(err){
      showToast(err.message||"Couldn't start session");
    }
  };
  const endBumSession=async()=>{
    if(!activeBumSession)return;
    try{
      await api.bumSessions.end(activeBumSession._backendId);
      showToast("Session ended 🍑");
    }catch(err){
      showToast(err.message||"Couldn't end session cleanly — it may already be over");
    }finally{
      setActiveBumSession(null);
      await loadCoreData(users);
    }
  };
  const extendBumSession=()=>{
    if(!activeBumSession)return;
    const u=users.find(x=>x.id===activeBumSession.id);
    if(!u)return;
    setMomoTarget({user:u,kind:"bum-extend",bumSessionBackendId:activeBumSession._backendId});
  };
  const activeBumUser=activeBumSession?users.find(x=>x.id===activeBumSession.id):null;

  // Contact/Bum approve+decline — called from ContactRequestsScreen and
  // CommunityTab, which used to mutate local state directly. Now they call
  // the real backend and this refreshes everything from it afterward.
  const approveContact=async creatorRequestUserId=>{
    const req=(await api.contactRequests.received()).requests.find(r=>r.creatorId===ME.id&&r.status==="paid_hold"&&r.payerId===creatorRequestUserId);
    if(!req){showToast("Request no longer available");return;}
    try{ await api.contactRequests.approve(req.id); showToast("Contact approved! 🎉"); }
    catch(err){ showToast(err.message||"Couldn't approve"); }
    await loadCoreData(users);
  };
  const declineContact=async payerUserId=>{
    const req=(await api.contactRequests.received()).requests.find(r=>r.creatorId===ME.id&&r.status==="paid_hold"&&r.payerId===payerUserId);
    if(!req){showToast("Request no longer available");return;}
    try{ await api.contactRequests.decline(req.id); showToast("Request declined."); }
    catch(err){ showToast(err.message||"Couldn't decline"); }
    await loadCoreData(users);
  };
  const approveBumReq=async bumBackendId=>{
    try{ await api.bumSessions.approve(bumBackendId); showToast("Live Bum session confirmed — payout released! 🍑💸"); }
    catch(err){ showToast(err.message||"Couldn't approve"); }
    await loadCoreData(users);
  };
  const declineBumReq=async bumBackendId=>{
    try{ await api.bumSessions.decline(bumBackendId); showToast("Session declined — payer refunded."); }
    catch(err){ showToast(err.message||"Couldn't decline"); }
    await loadCoreData(users);
  };

  const shared={
    liked,setLiked,posts,setPosts,shorts,setShorts,users,following,setFollowing,
    contactRequests,setContactRequests,approvedContacts,setApprovedContacts,
    bumRequests,setBumRequests,approvedBum,setApprovedBum,showToast,setProfileUser,setActiveTab:setTab,
    setShowUpload,setShowLive,setShowAdmin,setShowNotifs,notifs,setNotifs,openProfile,
    requestContact,requestBum,openChat,startBumSession,
    approveContact,declineContact,approveBumReq,declineBumReq,
  };

  const unread=notifs.filter(n=>!n.read).length;
  const incomingContact=(contactRequests.received||[]).length;

  if(!onboarded) return (<><GS/><Splash onDone={()=>setOnboarded(true)}/></>);

  // NAV now has 7 items: Home, Explore, Shorts, Community, Learn, Challenges, Profile
  const tabIdx={home:0,explore:1,shorts:2,community:3,learn:4,challenges:5,profile:6};
  const getBadge=(i)=>{
    if(i===3&&incomingContact>0)return incomingContact;
    if(i===0&&unread>0)return unread;
    return 0;
  };

  if(dataLoading){
    return (
      <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
        <Logo size="lg"/>
        <div style={{width:24,height:24,borderRadius:"50%",border:"3px solid rgba(255,255,255,0.15)",borderTop:"3px solid #FF3CAC",animation:"spinRing 1s linear infinite"}}/>
      </div>
    );
  }
  if(dataError){
    return (
      <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,padding:32,textAlign:"center"}}>
        <div style={{fontSize:44}}>📡</div>
        <div style={{fontFamily:"'Pacifico',cursive",fontSize:20,color:C.text}}>Can't reach Shakybum</div>
        <div style={{fontSize:13,color:C.sub,lineHeight:1.6,maxWidth:280}}>{dataError}</div>
        <button onClick={()=>{setDataLoading(true);loadCoreData();}} style={{background:"linear-gradient(135deg,#FF3CAC,#A855F7)",border:"none",borderRadius:14,padding:"12px 28px",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>Try again</button>
      </div>
    );
  }

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:C.bg,minHeight:"100vh",maxWidth:390,margin:"0 auto",position:"relative",color:C.text}}>
      <GS/>
      <Toast msg={toast}/>

      {/* Modals — layered by z-index */}
      {profileVideoUser&&<ProfileVideoModal user={profileVideoUser} onClose={()=>setProfileVideoUser(null)}/>}
      {profileUser&&<UserSheet user={profileUser} onClose={()=>setProfileUser(null)} openProfile={openProfile} {...shared}/>}
      {showUpload&&<VideoUploadModal mode={showUpload} onClose={()=>setShowUpload(null)} onDone={async({videoURL,caption,moveTag})=>{
        if(showUpload==="profile"){
          console.log("[upload diagnostic] persisting profile videoUrl:",videoURL);
          // ME is a module-level mutable object (see the login-flow comment
          // near ShakybumApp for why) — mutate in place immediately so the
          // UI updates without waiting on the network, then persist to the
          // backend so it survives a reload (this is the actual fix — the
          // previous version only ever did the local mutation below, which
          // is exactly why it kept vanishing on refresh).
          ME.videoUrl=videoURL;
          setMeVersion(v=>v+1);
          try{
            const res=await api.users.updateProfile({videoUrl:videoURL});
            console.log("[upload diagnostic] PATCH /users/me response:",res);
            showToast("Profile video saved! 💃");
          }catch(err){
            console.error("[upload diagnostic] PATCH /users/me failed:",err);
            showToast(err?.message||"Video shows now, but couldn't save — try again or it may not survive a reload");
          }
        }else if(showUpload==="short"){
          try{
            const{post}=await api.posts.create({videoUrl:videoURL,caption,kind:"short"});
            setShorts(p=>[mapPost(post),...p]);
            showToast("ShakyShort posted! ⚡");
          }catch(err){
            showToast(err?.message||"Couldn't post — try again");
          }
        }else{
          try{
            const{post}=await api.posts.create({videoUrl:videoURL,caption,moveTag,kind:"post"});
            setPosts(p=>[mapPost(post),...p]);
            showToast("Video posted! 🔥");
          }catch(err){
            showToast(err?.message||"Couldn't post — try again");
          }
        }
      }} showToast={showToast}/>}
      {showLive&&<LiveModal onClose={()=>setShowLive(false)} showToast={showToast}/>}
      {showNotifs&&<NotifScreen notifs={notifs} setNotifs={setNotifs} onClose={()=>setShowNotifs(false)}/>}
      {showAdmin&&<AdminPanel onClose={()=>setShowAdmin(false)} users={users} showToast={showToast}/>}
      {showSettings&&<SettingsScreen onClose={()=>setShowSettings(false)} showToast={showToast}/>}
      {showPrivacy&&<PrivacyScreen onClose={()=>setShowPrivacy(false)} showToast={showToast}/>}
      {showHelp&&<HelpScreen onClose={()=>setShowHelp(false)} showToast={showToast}/>}
      {showMyVideos&&<MyVideosScreen onClose={()=>setShowMyVideos(false)} showToast={showToast}/>}
      {showSavedMoves&&<SavedMovesScreen onClose={()=>setShowSavedMoves(false)} showToast={showToast}/>}
      {showMyChallenges&&<MyChallengesScreen onClose={()=>setShowMyChallenges(false)} showToast={showToast}/>}
      {showContactReqs&&<ContactRequestsScreen onClose={()=>setShowContactReqs(false)} showToast={showToast} contactRequests={contactRequests} approvedContacts={approvedContacts} users={users} openChat={u=>{setShowContactReqs(false);openChat(u);}} approveContact={approveContact} declineContact={declineContact}/>}
      {chatUser&&(
        <ChatScreen
          user={chatUser}
          messages={chats[chatUser.id]}
          onSend={sendMessage}
          onBlock={blockChat}
          onClose={()=>setChatUser(null)}
        />
      )}
      {momoTarget&&(
        <MomoPaymentModal
          amount={momoTarget.kind==="bum"?bumPriceFor(momoTarget.user,momoTarget.mins):momoTarget.kind==="bum-extend"?bumPriceFor(momoTarget.user,BUM_EXTEND_MIN):priceFor(momoTarget.user)}
          currency="GHS"
          purposeLabel={momoTarget.kind==="bum"?`Book a ${momoTarget.mins}-min Live Bum Session with ${momoTarget.user.name}`:momoTarget.kind==="bum-extend"?`Extend session with ${momoTarget.user.name} by ${BUM_EXTEND_MIN} min`:`Unlock ${momoTarget.user.name}'s contact`}
          ownerName={momoTarget.user.name}
          instant={momoTarget.kind==="bum-extend"}
          onClose={()=>setMomoTarget(null)}
          onSubmit={momoOnSubmit}
          onSuccess={momoOnSuccess}
        />
      )}
      {activeBumSession&&activeBumUser&&(
        <BumSessionScreen session={activeBumSession} user={activeBumUser} onExtend={extendBumSession} onEnd={endBumSession}/>
      )}

      {/* Main content */}
      <div style={{paddingBottom:74,minHeight:"100vh",background:`radial-gradient(ellipse at 50% 0%,#2e0a40,${C.bg} 55%)`}}>
        {tab===0&&<HomeTab {...shared}/>}
        {tab===1&&<ExploreTab {...shared}/>}
        {tab===2&&<ShakyShorts {...shared}/>}
        {tab===3&&<CommunityTab {...shared}/>}
        {tab===4&&<LearnTab {...shared}/>}
        {tab===5&&<ChallengesTab {...shared}/>}
        {tab===6&&(
          <ProfileTab
            showToast={showToast}
            setShowUpload={setShowUpload}
            setShowAdmin={setShowAdmin}
            setShowSettings={setShowSettings}
            setShowPrivacy={setShowPrivacy}
            setShowHelp={setShowHelp}
            setShowMyVideos={setShowMyVideos}
            setShowSavedMoves={setShowSavedMoves}
            setShowMyChallenges={setShowMyChallenges}
            setShowContactReqs={setShowContactReqs}
            notifs={notifs}
            contactRequests={contactRequests}
            bumRequests={bumRequests}
          />
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:390,background:"rgba(10,4,20,0.97)",backdropFilter:"blur(28px)",borderTop:`1px solid ${C.border}`,display:"flex",zIndex:100}}>
        {NAV.map((t,i)=>{
          const active=tab===i;
          const badge=getBadge(i);
          const isShorts=i===2;
          return (
            <button key={t.label} onClick={()=>setTab(i)} style={{flex:1,background:"none",border:"none",padding:isShorts?"8px 0 6px":"11px 0 8px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,position:"relative"}}>
              {isShorts?(
                <div style={{width:34,height:34,borderRadius:10,background:active?"linear-gradient(135deg,#FF3CAC,#A855F7)":"rgba(255,60,172,0.15)",border:`1.5px solid ${active?C.pink:C.borderH}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,marginBottom:1}}>⚡</div>
              ):(
                <span style={{fontSize:18}}>{t.icon}</span>
              )}
              <span style={{fontSize:9,fontWeight:active?700:400,color:active?C.pink:C.sub}}>{t.label}</span>
              {active&&!isShorts&&<div style={{width:22,height:3,borderRadius:2,background:"linear-gradient(90deg,#FF3CAC,#A855F7)"}}/>}
              {badge>0&&<div style={{position:"absolute",top:6,right:"calc(50% - 18px)",minWidth:16,height:16,borderRadius:8,background:C.pink,border:`2px solid ${C.bg}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#fff"}}>{badge}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── AUTH WRAPPER (entry point) ──
// ── MAIN AUTH FLOW ──
export default function ShakybumApp() {
  const [screen,setScreen]=useState("welcome"); // welcome | login | signup | forgot | app
  const [checkingSession,setCheckingSession]=useState(true);
  const [toast,setToast]=useState(null);
  const showToast=msg=>{setToast(msg);setTimeout(()=>setToast(null),3200);};

  // On load, if a token from a previous session exists, validate it and
  // skip straight to the app instead of making them log in again.
  useEffect(()=>{
    (async()=>{
      const token=getToken();
      if(!token){setCheckingSession(false);return;}
      try{
        const{user}=await api.auth.me();
        Object.assign(ME,mapUser(user));
        setScreen("app");
      }catch{
        clearToken(); // expired/invalid token — fall through to welcome screen
      }
      setCheckingSession(false);
    })();
  },[]);

  const onAuthed=user=>{
    Object.assign(ME,mapUser(user));
    setScreen("app");
  };

  if(checkingSession){
    return (
      <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at top,#2e0a40,${C.bg})`,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <Logo size="lg"/>
      </div>
    );
  }

  if(screen==="app") {
    return <MainApp/>;
  }

  return (
    <>
      <GS/>
      {screen==="welcome"&&<WelcomeScreen onLogin={()=>setScreen("login")} onSignup={()=>setScreen("signup")} onGuest={()=>{showToast("Guest mode has limited features — sign up to unlock payments and chat");setScreen("app");}}/>}
      {screen==="login"&&<LoginScreen onBack={()=>setScreen("welcome")} onSuccess={onAuthed} onForgot={()=>setScreen("forgot")} showToast={showToast}/>}
      {screen==="signup"&&<SignupScreen onBack={()=>setScreen("welcome")} onSuccess={onAuthed} onLogin={()=>setScreen("login")} showToast={showToast}/>}
      {screen==="forgot"&&<ForgotScreen onBack={()=>setScreen("login")} onSuccess={()=>setScreen("login")}/>}
      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"11px 18px",color:C.text,fontSize:13,fontWeight:600,zIndex:999,boxShadow:"0 8px 24px rgba(0,0,0,0.4)",maxWidth:320,textAlign:"center"}}>{toast}</div>}
    </>
  );
}
