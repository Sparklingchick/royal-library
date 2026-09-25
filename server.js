const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

if (!DATABASE_URL || !JWT_SECRET) {
  console.warn('DATABASE_URL and JWT_SECRET must be configured in Render environment variables.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json({limit:'2mb'}));
app.use(express.static(path.join(__dirname)));

async function q(text, params=[]) {
  const r = await pool.query(text, params);
  return r.rows;
}

function sign(user) {
  return jwt.sign({id:user.id,email:user.email,role:user.role}, JWT_SECRET, {expiresIn:'7d'});
}

function auth(req,res,next) {
  try {
    const h=req.headers.authorization||'';
    const token=h.startsWith('Bearer ')?h.slice(7):null;
    if(!token) return res.status(401).json({error:'Authentication required'});
    req.user=jwt.verify(token,JWT_SECRET);
    next();
  } catch(e) { return res.status(401).json({error:'Invalid or expired session'}); }
}
function admin(req,res,next){
  if(req.user.role!=='admin') return res.status(403).json({error:'Admin access required'});
  next();
}

async function initDb(){
  await q(`
    CREATE TABLE IF NOT EXISTS users(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS categories(
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS books(
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      description TEXT DEFAULT '',
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      isbn TEXT DEFAULT '',
      cover_url TEXT DEFAULT '',
      total_copies INTEGER NOT NULL DEFAULT 1 CHECK(total_copies >= 0),
      available_copies INTEGER NOT NULL DEFAULT 1 CHECK(available_copies >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS borrowings(
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      borrowed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      due_date DATE NOT NULL,
      returned_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'borrowed'
        CHECK(status IN ('borrowed','returned','overdue')),
      UNIQUE(user_id,book_id,status)
    );
    CREATE TABLE IF NOT EXISTS favourites(
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(user_id,book_id)
    );
    CREATE TABLE IF NOT EXISTS activities(
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS notifications(
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_preferences(
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      categories TEXT[] NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const cats=['Fiction','Science','Technology','History','Biography','Education','Business','Romance','Mystery','Religion'];
  for(const c of cats) await q('INSERT INTO categories(name) VALUES($1) ON CONFLICT(name) DO NOTHING',[c]);
  const adminEmail=process.env.ADMIN_EMAIL;
  const adminPassword=process.env.ADMIN_PASSWORD;
  if(adminEmail && adminPassword){
    const existing=await q('SELECT id FROM users WHERE email=$1',[adminEmail]);
    if(!existing.length){
      const hash=await bcrypt.hash(adminPassword,12);
      await q('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4)',
        ['Royal Library Admin',adminEmail,hash,'admin']);
    }
  }
}

app.get('/api/health', async (req,res)=>{
  try { await q('SELECT 1'); res.json({ok:true,database:true}); }
  catch(e){ res.status(500).json({ok:false,database:false,error:e.message}); }
});

app.post('/api/auth/register', async (req,res)=>{
  try{
    const {name,email,password}=req.body||{};
    if(!name||!email||!password||password.length<6) return res.status(400).json({error:'Name, valid email and password (6+ characters) are required'});
    const exists=await q('SELECT id FROM users WHERE lower(email)=lower($1)',[email]);
    if(exists.length) return res.status(409).json({error:'An account with this email already exists'});
    const hash=await bcrypt.hash(password,12);
    const rows=await q('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email,role,status,created_at',
      [name,email.toLowerCase(),hash]);
    const user=rows[0];
    const token=sign(user);
    res.json({token,user});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/auth/login', async (req,res)=>{
  try{
    const {email,password}=req.body||{};
    const rows=await q('SELECT * FROM users WHERE lower(email)=lower($1)',[email||'']);
    if(!rows.length || !(await bcrypt.compare(password||'',rows[0].password_hash))) return res.status(401).json({error:'Invalid email or password'});
    const u=rows[0];
    if(u.status!=='active') return res.status(403).json({error:'This account is suspended'});
    const user={id:u.id,name:u.name,email:u.email,role:u.role,status:u.status};
    res.json({token:sign(user),user});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/auth/me',auth,async(req,res)=>{
  const rows=await q('SELECT id,name,email,role,status,created_at FROM users WHERE id=$1',[req.user.id]);
  if(!rows.length) return res.status(404).json({error:'User not found'});
  res.json({user:rows[0]});
});

app.get('/api/public',async(req,res)=>{
  try{
    const books=await q(`SELECT b.*,c.name category FROM books b LEFT JOIN categories c ON c.id=b.category_id ORDER BY b.created_at DESC`);
    const categories=await q('SELECT * FROM categories ORDER BY name');
    res.json({books,categories});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/books',async(req,res)=>{
  const term=(req.query.q||'').trim();
  const books=await q(`
    SELECT b.*,c.name category
    FROM books b LEFT JOIN categories c ON c.id=b.category_id
    WHERE $1='' OR b.title ILIKE '%'||$1||'%' OR b.author ILIKE '%'||$1||'%' OR b.description ILIKE '%'||$1||'%'
    ORDER BY b.created_at DESC`,[term]);
  res.json({books});
});

app.get('/api/user/dashboard',auth,async(req,res)=>{
  try{
    const [profile,borrowings,favs,notes,activities]=await Promise.all([
      q('SELECT id,name,email,role,status,created_at FROM users WHERE id=$1',[req.user.id]),
      q(`SELECT br.*,b.title,b.author,b.cover_url FROM borrowings br JOIN books b ON b.id=br.book_id WHERE br.user_id=$1 ORDER BY br.borrowed_at DESC`,[req.user.id]),
      q(`SELECT f.*,b.title,b.author,b.cover_url FROM favourites f JOIN books b ON b.id=f.book_id WHERE f.user_id=$1 ORDER BY f.created_at DESC`,[req.user.id]),
      q('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',[req.user.id]),
      q('SELECT * FROM activities WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',[req.user.id])
    ]);
    res.json({profile:profile[0],borrowings,favourites:favs,notifications:notes,activities});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/borrow',auth,async(req,res)=>{
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const {bookId}=req.body||{};
    const b=(await client.query('SELECT * FROM books WHERE id=$1 FOR UPDATE',[bookId])).rows[0];
    if(!b) throw new Error('Book not found');
    if(b.available_copies<1) throw new Error('No available copies');
    const active=(await client.query(`SELECT id FROM borrowings WHERE user_id=$1 AND status IN('borrowed','overdue')`,[req.user.id])).rowCount;
    if(active>=3) throw new Error('Maximum of 3 active loans reached');
    const dup=(await client.query(`SELECT id FROM borrowings WHERE user_id=$1 AND book_id=$2 AND status IN('borrowed','overdue')`,[req.user.id,bookId])).rowCount;
    if(dup) throw new Error('You already have this book');
    const loan=(await client.query(`INSERT INTO borrowings(user_id,book_id,due_date) VALUES($1,$2,CURRENT_DATE+14) RETURNING *`,[req.user.id,bookId])).rows[0];
    await client.query('UPDATE books SET available_copies=available_copies-1 WHERE id=$1',[bookId]);
    await client.query(`INSERT INTO activities(user_id,type,message) VALUES($1,'borrow','Borrowed a book')`,[req.user.id]);
    await client.query(`INSERT INTO notifications(user_id,title,message) VALUES($1,'Book borrowed','Your book is due in 14 days')`,[req.user.id]);
    await client.query('COMMIT');
    res.json({loan});
  }catch(e){await client.query('ROLLBACK');res.status(400).json({error:e.message});}
  finally{client.release();}
});

app.post('/api/return',auth,async(req,res)=>{
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const loan=(await client.query(`SELECT * FROM borrowings WHERE id=$1 AND user_id=$2 AND status IN('borrowed','overdue') FOR UPDATE`,[req.body?.loanId,req.user.id])).rows[0];
    if(!loan) throw new Error('Active loan not found');
    await client.query(`UPDATE borrowings SET status='returned',returned_at=NOW() WHERE id=$1`,[loan.id]);
    await client.query('UPDATE books SET available_copies=LEAST(total_copies,available_copies+1) WHERE id=$1',[loan.book_id]);
    await client.query(`INSERT INTO activities(user_id,type,message) VALUES($1,'return','Returned a book')`,[req.user.id]);
    await client.query('COMMIT');
    res.json({ok:true});
  }catch(e){await client.query('ROLLBACK');res.status(400).json({error:e.message});}
  finally{client.release();}
});

app.post('/api/favourites',auth,async(req,res)=>{
  try{
    await q(`INSERT INTO favourites(user_id,book_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[req.user.id,req.body?.bookId]);
    res.json({ok:true});
  }catch(e){res.status(400).json({error:e.message});}
});
app.delete('/api/favourites/:bookId',auth,async(req,res)=>{
  await q('DELETE FROM favourites WHERE user_id=$1 AND book_id=$2',[req.user.id,req.params.bookId]);
  res.json({ok:true});
});

app.get('/api/admin/summary',auth,admin,async(req,res)=>{
  try{
    const [users,books,loans,overdue,activity]=await Promise.all([
      q(`SELECT COUNT(*)::int count FROM users WHERE role='member'`),
      q(`SELECT COUNT(*)::int count FROM books`),
      q(`SELECT COUNT(*)::int count FROM borrowings WHERE status IN('borrowed','overdue')`),
      q(`SELECT COUNT(*)::int count FROM borrowings WHERE status='overdue' OR (status='borrowed' AND due_date<CURRENT_DATE)`),
      q(`SELECT a.*,u.name FROM activities a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 50`)
    ]);
    res.json({members:users[0].count,books:books[0].count,activeLoans:loans[0].count,overdue:overdue[0].count,activity});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/admin/books',auth,admin,async(req,res)=>{
  const books=await q(`SELECT b.*,c.name category FROM books b LEFT JOIN categories c ON c.id=b.category_id ORDER BY b.created_at DESC`);
  res.json({books});
});
app.post('/api/admin/books',auth,admin,async(req,res)=>{
  try{
    const {title,author,description='',category_id=null,isbn='',cover_url='',total_copies=1}=req.body||{};
    if(!title||!author) return res.status(400).json({error:'Title and author are required'});
    const rows=await q(`INSERT INTO books(title,author,description,category_id,isbn,cover_url,total_copies,available_copies)
      VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
      [title,author,description,category_id||null,isbn,cover_url,Math.max(0,Number(total_copies)||0)]);
    res.json({book:rows[0]});
  }catch(e){res.status(400).json({error:e.message});}
});
app.put('/api/admin/books/:id',auth,admin,async(req,res)=>{
  try{
    const b=(await q('SELECT * FROM books WHERE id=$1',[req.params.id]))[0];
    if(!b) return res.status(404).json({error:'Book not found'});
    const {title,author,description='',category_id=null,isbn='',cover_url='',total_copies=b.total_copies}=req.body||{};
    const borrowed=b.total_copies-b.available_copies;
    const total=Math.max(borrowed,Number(total_copies)||0);
    const rows=await q(`UPDATE books SET title=$1,author=$2,description=$3,category_id=$4,isbn=$5,cover_url=$6,total_copies=$7,available_copies=$7-$8 WHERE id=$9 RETURNING *`,
      [title,author,description,category_id||null,isbn,cover_url,total,borrowed,req.params.id]);
    res.json({book:rows[0]});
  }catch(e){res.status(400).json({error:e.message});}
});
app.delete('/api/admin/books/:id',auth,admin,async(req,res)=>{
  try{ await q('DELETE FROM books WHERE id=$1',[req.params.id]); res.json({ok:true});}
  catch(e){res.status(400).json({error:e.message});}
});

app.get('/api/admin/users',auth,admin,async(req,res)=>{
  const users=await q(`SELECT id,name,email,role,status,created_at FROM users ORDER BY created_at DESC`);
  res.json({users});
});
app.patch('/api/admin/users/:id/status',auth,admin,async(req,res)=>{
  const status=req.body?.status;
  if(!['active','suspended'].includes(status)) return res.status(400).json({error:'Invalid status'});
  await q('UPDATE users SET status=$1 WHERE id=$2',[status,req.params.id]);
  res.json({ok:true});
});

app.get('/api/recommendations',auth,async(req,res)=>{
  try{
    // Simple explainable hybrid: books in categories the member borrowed/favourited,
    // excluding books already borrowed currently. This can later be extended with TF-IDF.
    const books=await q(`
      WITH prefs AS (
        SELECT b.category_id, COUNT(*) score
        FROM borrowings br JOIN books b ON b.id=br.book_id
        WHERE br.user_id=$1
        GROUP BY b.category_id
        UNION ALL
        SELECT b.category_id, 1 FROM favourites f JOIN books b ON b.id=f.book_id WHERE f.user_id=$1
      ), scores AS (
        SELECT category_id,SUM(score) score FROM prefs GROUP BY category_id
      )
      SELECT b.*,c.name category,COALESCE(s.score,0) relevance
      FROM books b
      LEFT JOIN categories c ON c.id=b.category_id
      LEFT JOIN scores s ON s.category_id=b.category_id
      WHERE b.id NOT IN (
        SELECT book_id FROM borrowings WHERE user_id=$1 AND status IN('borrowed','overdue')
      )
      ORDER BY relevance DESC,b.created_at DESC LIMIT 12`,[req.user.id]);
    res.json({recommendations:books});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get('*',(req,res)=>{
  res.sendFile(path.join(__dirname,'index.html'));
});

initDb().then(()=>app.listen(PORT,()=>console.log(`Royal Library running on ${PORT}`)))
.catch(err=>{console.error('Database initialization failed:',err); process.exit(1);});
