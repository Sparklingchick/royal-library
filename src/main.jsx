import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen, Search, Sparkles, LayoutDashboard, Library, Heart, Clock3, LogIn,
  UserPlus, LogOut, Menu, X, ChevronRight, ArrowRight, BookMarked, Users,
  BarChart3, Plus, Trash2, RotateCcw, ShieldCheck, Star, CalendarDays,
  CheckCircle2, AlertCircle, Loader2
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "./supabase";
import "./styles.css";

const demoBooks = [
  {id:1,title:"Things Fall Apart",author:"Chinua Achebe",category:"Literature",description:"A landmark Nigerian novel exploring tradition, identity and change.",cover_url:"",available_copies:4,total_copies:5},
  {id:2,title:"Clean Code",author:"Robert C. Martin",category:"Computer Science",description:"Practical principles for writing readable and maintainable software.",cover_url:"",available_copies:2,total_copies:3},
  {id:3,title:"Atomic Habits",author:"James Clear",category:"Self Development",description:"A practical framework for building better habits through small changes.",cover_url:"",available_copies:6,total_copies:8},
  {id:4,title:"The Lean Startup",author:"Eric Ries",category:"Business",description:"Methods for building products, learning from customers and reducing waste.",cover_url:"",available_copies:3,total_copies:4},
  {id:5,title:"A Brief History of Time",author:"Stephen Hawking",category:"Science",description:"An accessible journey through cosmology and the nature of the universe.",cover_url:"",available_copies:2,total_copies:2},
  {id:6,title:"Half of a Yellow Sun",author:"Chimamanda Ngozi Adichie",category:"Literature",description:"A powerful story of love, war, memory and the Nigerian experience.",cover_url:"",available_copies:4,total_copies:5}
];

const demoCategories = ["All","Computer Science","Business","Literature","Science","History","Self Development","Education","Technology"];

function App(){
  const [page,setPage] = useState("home");
  const [menu,setMenu] = useState(false);
  const [session,setSession] = useState(null);
  const [profile,setProfile] = useState(null);
  const [books,setBooks] = useState([]);
  const [categories,setCategories] = useState([]);
  const [query,setQuery] = useState("");
  const [category,setCategory] = useState("All");
  const [selectedBook,setSelectedBook] = useState(null);
  const [authMode,setAuthMode] = useState("login");
  const [loading,setLoading] = useState(true);
  const [notice,setNotice] = useState("");

  const demo = !isSupabaseConfigured;

  useEffect(() => {
    loadBooks();
    if (demo) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({data})=>{
      if(data.session) loadProfile(data.session);
      setSession(data.session);
      setLoading(false);
    });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,s)=>{
      setSession(s);
      if(s) loadProfile(s); else setProfile(null);
    });
    return ()=>subscription.unsubscribe();
  }, []);

  async function loadBooks(){
    if(demo){ setBooks(demoBooks); setCategories(demoCategories); return; }
    const [{data:b,error:be},{data:c,error:ce}] = await Promise.all([
      supabase.from("books").select("*, categories(name)").order("created_at",{ascending:false}),
      supabase.from("categories").select("*").order("name")
    ]);
    if(be) setNotice(be.message); else setBooks((b||[]).map(x=>({...x,category:x.categories?.name||"Uncategorized"})));
    if(!ce) setCategories(["All",...(c||[]).map(x=>x.name)]);
  }

  async function loadProfile(s){
    const {data} = await supabase.from("profiles").select("*").eq("id",s.user.id).single();
    setProfile(data);
  }

  const filtered = useMemo(()=>books.filter(b=>{
    const q=query.toLowerCase();
    return (!q || `${b.title} ${b.author} ${b.category} ${b.description||""}`.toLowerCase().includes(q))
      && (category==="All" || b.category===category);
  }),[books,query,category]);

  function go(p){setPage(p);setMenu(false);window.scrollTo({top:0,behavior:"smooth"});}
  function openBook(b){setSelectedBook(b);go("details");}

  async function signOut(){
    if(!demo) await supabase.auth.signOut();
    setSession(null);setProfile(null);go("home");
  }

  async function borrow(book){
    if(!session && !demo){setAuthMode("login");go("auth");return;}
    if(demo){setNotice("Demo mode: connect Supabase to enable real borrowing.");return;}
    const {error}=await supabase.rpc("borrow_book",{p_book_id:book.id});
    setNotice(error ? error.message : "Book borrowed successfully.");
    await loadBooks();
  }

  return <div className="app">
    <header className="header">
      <div className="container nav">
        <button className="brand" onClick={()=>go("home")}><span className="brandMark"><BookOpen size={21}/></span><span>Royal <b>Library</b></span></button>
        <nav className={menu?"navLinks open":"navLinks"}>
          <button onClick={()=>go("home")}>Home</button>
          <button onClick={()=>go("catalog")}>Catalogue</button>
          <button onClick={()=>go("recommendations")}>Recommendations</button>
          {session && <button onClick={()=>go("dashboard")}>Dashboard</button>}
          {profile?.role==="admin" && <button onClick={()=>go("admin")}>Admin</button>}
          {session ? <button className="navAuth" onClick={signOut}><LogOut size={16}/> Sign out</button> :
            <button className="navAuth" onClick={()=>{setAuthMode("login");go("auth")}}><LogIn size={16}/> Sign in</button>}
        </nav>
        <button className="mobileMenu" onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button>
      </div>
    </header>

    {demo && <div className="demoBar"><AlertCircle size={15}/> Preview mode — connect Supabase to enable authentication, borrowing and live data.</div>}
    {notice && <div className="notice"><span>{notice}</span><button onClick={()=>setNotice("")}><X size={15}/></button></div>}

    <main>
      {page==="home" && <Home go={go} books={books} openBook={openBook}/>}
      {page==="catalog" && <Catalog books={filtered} categories={categories.length?categories:demoCategories} query={query} setQuery={setQuery} category={category} setCategory={setCategory} openBook={openBook}/>}
      {page==="details" && selectedBook && <Details book={selectedBook} borrow={borrow} go={go}/>}
      {page==="auth" && <Auth mode={authMode} setMode={setAuthMode} demo={demo} onSuccess={(s)=>{setSession(s);go("dashboard")}}/>}
      {page==="dashboard" && <Dashboard session={session} profile={profile} books={books} demo={demo} go={go}/>}
      {page==="recommendations" && <Recommendations session={session} demo={demo} books={books} openBook={openBook}/>}
      {page==="admin" && <Admin books={books} reload={loadBooks} demo={demo}/>}
    </main>

    <footer><div className="container footerGrid"><div><div className="brand footerBrand"><span className="brandMark"><BookOpen size={20}/></span>Royal <b>Library</b></div><p>Digital library management with personalized book discovery.</p></div><div><strong>Library</strong><span>Catalogue</span><span>Recommendations</span><span>Member dashboard</span></div><div><strong>System</strong><span>Book borrowing</span><span>Borrowing history</span><span>Admin management</span></div></div><div className="container footerBottom">© {new Date().getFullYear()} Royal Library · Digital Library Management & Personalized Recommendation System</div></footer>
  </div>
}

function Home({go,books,openBook}){
  return <section>
    <div className="hero"><div className="container heroGrid">
      <div className="heroCopy"><div className="eyebrow"><Sparkles size={15}/> SMARTER LIBRARY DISCOVERY</div><h1>Find books that fit <em>your</em> next chapter.</h1><p>Search the library catalogue, manage your borrowing and discover personalized books based on your reading interests and history.</p><div className="heroActions"><button className="primary" onClick={()=>go("catalog")}>Explore catalogue <ArrowRight size={17}/></button><button className="secondary" onClick={()=>go("recommendations")}>See recommendations <Sparkles size={16}/></button></div><div className="heroStats"><span><b>{books.length||0}+</b><small>sample titles</small></span><span><b>24/7</b><small>web access</small></span><span><b>Smart</b><small>discovery</small></span></div></div>
      <div className="heroVisual"><div className="shelfCard"><div className="shelfTop"><span>Featured collection</span><Star size={17}/></div><div className="coverStack"><Cover book={books[0]} big/><Cover book={books[1]}/><Cover book={books[2]}/></div><div className="shelfInfo"><b>Discover something new</b><span>Personalized discovery meets library management.</span></div></div></div>
    </div></div>
    <div className="container section"><div className="sectionHead"><div><span className="eyebrow">DISCOVER</span><h2>Popular in the catalogue</h2></div><button className="textButton" onClick={()=>go("catalog")}>View all <ChevronRight size={16}/></button></div><div className="bookGrid">{books.slice(0,4).map(b=><BookCard key={b.id} book={b} openBook={openBook}/>)}</div></div>
    <div className="container featureBand"><div><span className="eyebrow">BUILT FOR YOUR PROJECT</span><h2>One library. Two layers of intelligence.</h2><p>Core library operations are combined with a hybrid recommendation layer using content characteristics and user behaviour.</p></div><div className="featureCards"><Feature icon={<Library/>} title="Library management" text="Catalogue, members, borrowing, returns and availability."/><Feature icon={<Sparkles/>} title="Personalized discovery" text="Content-based and collaborative recommendation principles."/><Feature icon={<ShieldCheck/>} title="Role-based access" text="Separate member and administrator functions."/></div></div>
  </section>
}

function Feature({icon,title,text}){return <div className="feature"><div className="featureIcon">{icon}</div><div><b>{title}</b><span>{text}</span></div></div>}

function Catalog({books,categories,query,setQuery,category,setCategory,openBook}){
 return <section className="page"><div className="container"><div className="pageTitle"><div><span className="eyebrow">ONLINE PUBLIC CATALOGUE</span><h1>Browse the library</h1><p>Search by title, author, category or keyword.</p></div></div><div className="filters"><div className="searchBox"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search books, authors, keywords..."/></div><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></div><div className="resultLine">{books.length} book{books.length!==1?"s":""} found</div><div className="bookGrid">{books.map(b=><BookCard key={b.id} book={b} openBook={openBook}/>)}</div>{!books.length&&<div className="empty"><BookOpen size={32}/><h3>No books found</h3><p>Try another search or category.</p></div>}</div></section>
}

function BookCard({book,openBook}){
 return <article className="bookCard" onClick={()=>openBook(book)}><Cover book={book}/><div className="bookBody"><span className="pill">{book.category||"General"}</span><h3>{book.title}</h3><p>{book.author}</p><div className="cardBottom"><span className={book.available_copies>0?"available":"unavailable"}>{book.available_copies>0?"Available":"Unavailable"}</span><ChevronRight size={16}/></div></div></article>
}

function Cover({book,big=false}){
 if(!book) return <div className={big?"cover bigCover":"cover"}><BookOpen/></div>;
 return <div className={big?"cover bigCover":"cover"} style={book.cover_url?{backgroundImage:`url(${book.cover_url})`}:{}}>{!book.cover_url&&<><BookOpen size={big?38:28}/><strong>{book.title}</strong><small>{book.author}</small></>}</div>
}

function Details({book,borrow,go}){
 return <section className="page"><div className="container detailGrid"><div><Cover book={book} big/></div><div className="detailCopy"><span className="pill">{book.category}</span><h1>{book.title}</h1><h3>by {book.author}</h3><p>{book.description}</p><div className="metaGrid"><span><small>Availability</small><b>{book.available_copies} of {book.total_copies} copies</b></span><span><small>Category</small><b>{book.category}</b></span></div><div className="detailActions"><button className="primary" disabled={!book.available_copies} onClick={()=>borrow(book)}>{book.available_copies?"Borrow book":"Currently unavailable"} <BookMarked size={17}/></button><button className="secondary" onClick={()=>go("catalog")}>Back to catalogue</button></div></div></div></section>
}

function Auth({mode,setMode,demo,onSuccess}){
 const [form,setForm]=useState({name:"",email:"",password:""}); const [busy,setBusy]=useState(false); const [err,setErr]=useState("");
 async function submit(e){e.preventDefault();setErr("");setBusy(true);
   if(demo){setBusy(false);onSuccess({user:{id:"demo"}});return;}
   if(mode==="login"){const {data,error}=await supabase.auth.signInWithPassword({email:form.email,password:form.password});if(error)setErr(error.message);else onSuccess(data.session);}
   else {const {data,error}=await supabase.auth.signUp({email:form.email,password:form.password,options:{data:{full_name:form.name}}});if(error)setErr(error.message);else if(data.session)onSuccess(data.session);else setErr("Account created. Check your email if email confirmation is enabled.");}
   setBusy(false);
 }
 return <section className="page authPage"><div className="authCard"><div className="authIntro"><span className="brandMark large"><BookOpen/></span><span className="eyebrow">ROYAL LIBRARY</span><h1>{mode==="login"?"Welcome back.":"Create your library account."}</h1><p>{mode==="login"?"Sign in to manage your borrowing and discover books tailored to you.":"Join the library to borrow books and receive personalized recommendations."}</p></div><form onSubmit={submit}>{mode==="register"&&<label>Full name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>}<label>Email<input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Password<input type="password" required minLength="6" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label>{err&&<div className="error">{err}</div>}<button className="primary full" disabled={busy}>{busy?<Loader2 className="spin"/>:(mode==="login"?"Sign in":"Create account")}</button></form><div className="switchAuth">{mode==="login"?"New to Royal Library?":"Already have an account?"} <button onClick={()=>setMode(mode==="login"?"register":"login")}>{mode==="login"?"Create an account":"Sign in"}</button></div></div></section>
}

function Dashboard({profile,books,demo,go}){
 return <section className="page"><div className="container"><div className="dashWelcome"><div><span className="eyebrow">MEMBER DASHBOARD</span><h1>Good to see you{profile?.full_name?`, ${profile.full_name.split(" ")[0]}`:""}.</h1><p>Keep track of your library activity and discover your next book.</p></div><button className="primary" onClick={()=>go("catalog")}>Browse books <ArrowRight size={16}/></button></div><div className="metricGrid"><Metric icon={<BookMarked/>} value="0" label="Currently borrowed"/><Metric icon={<Clock3/>} value="0" label="Due soon"/><Metric icon={<Heart/>} value="0" label="Favourites"/><Metric icon={<Sparkles/>} value="8" label="Recommendations"/></div><div className="dashboardGrid"><div className="panel"><div className="panelHead"><h3>Current loans</h3><span>Nothing borrowed yet</span></div><div className="empty small"><BookMarked/><p>{demo?"Connect Supabase to activate real borrowing.":"Your active loans will appear here."}</p></div></div><div className="panel"><div className="panelHead"><h3>Recommended for you</h3><button onClick={()=>go("recommendations")}>View all</button></div><div className="miniBooks">{books.slice(0,3).map(b=><div className="miniBook" key={b.id}><Cover book={b}/><div><b>{b.title}</b><span>{b.author}</span></div></div>)}</div></div></div></div></section>
}
function Metric({icon,value,label}){return <div className="metric"><div className="metricIcon">{icon}</div><div><b>{value}</b><span>{label}</span></div></div>}

function Recommendations({session,demo,books,openBook}){
 const [recs,setRecs]=useState(books.slice(0,4)); const [loading,setLoading]=useState(false);
 useEffect(()=>{if(!demo&&session){setLoading(true);supabase.rpc("get_recommendations",{p_limit:8}).then(({data})=>{if(data?.length)setRecs(data);setLoading(false);});}},[demo,session]);
 return <section className="page"><div className="container"><div className="pageTitle"><div><span className="eyebrow"><Sparkles size={14}/> PERSONALIZED DISCOVERY</span><h1>Recommended for you</h1><p>{session?"Suggestions based on your library interactions.":"Preview the recommendation experience. Sign in to personalize it."}</p></div></div><div className="recommendBanner"><div><b>Hybrid recommendation engine</b><span>Content similarity helps with limited history; collaborative signals can be added as interaction data grows.</span></div><Sparkles size={30}/></div>{loading?<div className="empty"><Loader2 className="spin"/></div>:<div className="bookGrid">{recs.map(b=><BookCard key={b.id} book={b} openBook={openBook}/>)}</div>}</div></section>
}

function Admin({books,reload,demo}){
 const [show,setShow]=useState(false); const [form,setForm]=useState({title:"",author:"",category:"",description:"",total_copies:1});
 async function add(e){e.preventDefault(); if(demo){alert("Connect Supabase first.");return;} const {data:c}=await supabase.from("categories").select("id").eq("name",form.category).single(); const {error}=await supabase.from("books").insert({...form,category_id:c?.id,available_copies:Number(form.total_copies)}); if(error)alert(error.message); else {setShow(false);setForm({title:"",author:"",category:"",description:"",total_copies:1});reload();}}
 return <section className="page"><div className="container"><div className="dashWelcome"><div><span className="eyebrow"><ShieldCheck size={14}/> ADMINISTRATION</span><h1>Library control centre</h1><p>Manage books, members, circulation and reports.</p></div><button className="primary" onClick={()=>setShow(!show)}><Plus size={17}/> Add book</button></div><div className="metricGrid"><Metric icon={<Library/>} value={books.length} label="Books"/><Metric icon={<Users/>} value="—" label="Members"/><Metric icon={<BookMarked/>} value="—" label="Active loans"/><Metric icon={<BarChart3/>} value="—" label="Overdue"/></div>{show&&<form className="adminForm panel" onSubmit={add}><h3>Add a book</h3><div className="formGrid"><label>Title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label><label>Author<input required value={form.author} onChange={e=>setForm({...form,author:e.target.value})}/></label><label>Category<input value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label><label>Total copies<input type="number" min="1" value={form.total_copies} onChange={e=>setForm({...form,total_copies:e.target.value})}/></label></div><label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><button className="primary">Save book</button></form>}<div className="panel tablePanel"><div className="panelHead"><h3>Catalogue management</h3><span>{books.length} records</span></div><div className="tableWrap"><table><thead><tr><th>Book</th><th>Author</th><th>Category</th><th>Availability</th></tr></thead><tbody>{books.map(b=><tr key={b.id}><td><b>{b.title}</b></td><td>{b.author}</td><td>{b.category}</td><td>{b.available_copies}/{b.total_copies}</td></tr>)}</tbody></table></div></div></div></section>
}

if(!document.getElementById("root")) throw new Error("Root element missing");
createRoot(document.getElementById("root")).render(<App/>);
