import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
test.setTimeout(60_000);
let html;
test.beforeAll(async () => {
  // Test-only project: every Supabase request is intercepted below. No mail is sent.
  const result = await build({
    entryPoints:['app.js'],bundle:true,jsx:'automatic',format:'iife',write:false,outdir:'test-memory',
    loader:{'.png':'dataurl','.woff':'dataurl','.woff2':'dataurl'},
    define:{'import.meta.env':JSON.stringify({VITE_SUPABASE_URL:'https://verification-test.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'test-public-key'})},
  });
  const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text.replaceAll('/assets/','./public/assets/').replaceAll('</script','<\\/script');
  const css=result.outputFiles.find(f=>f.path.endsWith('.css')).text+'\n'+await readFile('styles.css','utf8');
  html=(await readFile('source.html','utf8')).replace('<link rel="stylesheet" href="/styles.css" />',()=>`<style>${css}</style>`).replace('<script type="module" src="/app.js"></script>',()=>`<script>${js}</script>`);
});
async function mockProject(page) {
  let confirmed=false;
  const calls=[];
  const user=()=>({id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'member@example.com',email_confirmed_at:confirmed?'2026-10-16T00:00:00Z':undefined,user_metadata:{name:'Verified Member'},created_at:'2026-10-16T00:00:00Z'});
  const session=()=>({access_token:`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:user().id,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test-signature`,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user:user()});
  await page.route('**/verification-fixture.html',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.route('https://verification-test.supabase.co/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    const body=request.postDataJSON();
    calls.push({path:url.pathname,method:request.method(),body});
    let status=200,payload;
    if(url.pathname==='/auth/v1/signup') payload={user:user(),session:null};
    else if(url.pathname==='/auth/v1/token') {
      if(!confirmed) {status=400;payload={code:'email_not_confirmed',msg:'Email not confirmed'};}
      else payload=session();
    } else if(url.pathname==='/auth/v1/verify') {
      if(body.token!=='123456') {status=403;payload={code:'otp_expired',msg:'Token has expired or is invalid'};}
      else {confirmed=true;payload=session();}
    } else if(url.pathname==='/auth/v1/user') payload=user();
    else if(url.pathname==='/auth/v1/resend') payload={};
    else if(url.pathname==='/auth/v1/logout') payload={};
    else if(url.pathname.startsWith('/rest/v1/')) payload=[];
    else throw Error(`Unmocked Auth endpoint: ${url.pathname}`);
    await route.fulfill({status,headers:{'x-supabase-api-version':'2024-01-01','access-control-expose-headers':'x-supabase-api-version'},contentType:'application/json',body:JSON.stringify(payload)});
  });
  return calls;
}
test('signup confirms a server code, survives refresh and rejects expired codes',async({page})=>{
  const calls=await mockProject(page);
  await page.goto('/verification-fixture.html#/signup');
  await page.getByLabel('Full name',{exact:true}).fill('Verified Member');
  await page.getByLabel('Email address',{exact:true}).fill('member@example.com');
  await page.getByLabel('Password',{exact:true}).fill('SamplePassword123');
  await page.getByRole('button',{name:'CREATE ACCOUNT'}).click();
  await expect(page.getByRole('heading',{name:'VERIFY YOUR EMAIL.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'RESEND CODE'})).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel('Email address',{exact:true})).toHaveValue('member@example.com');
  await expect(page.getByRole('button',{name:'RESEND CODE'})).toBeDisabled();
  await page.getByLabel('Verification code',{exact:true}).fill('111111');
  await page.getByRole('button',{name:'VERIFY EMAIL'}).click();
  await expect(page.locator('.customer-error')).toContainText('expired');
  await expect(page.getByRole('heading',{name:'YOUR INNER CIRCLE.'})).toHaveCount(0);
  await page.getByLabel('Verification code',{exact:true}).fill('123456');
  await page.getByRole('button',{name:'VERIFY EMAIL'}).click();
  await expect(page.getByRole('heading',{name:'YOUR INNER CIRCLE.'})).toBeVisible();
  expect(calls.filter(c=>c.path==='/auth/v1/verify').map(c=>c.body.type)).toEqual(['email','email']);
  expect(await page.evaluate(()=>sessionStorage.getItem('crownetic.email-verification.v1'))).toBeNull();
  await page.getByRole('button',{name:'SIGN OUT',exact:true}).click();
  await page.getByLabel('Email address or username',{exact:true}).fill('member@example.com');
  await page.getByLabel('Password',{exact:true}).fill('SamplePassword123');
  await page.getByRole('button',{name:'LOG IN'}).click();
  await expect(page.getByRole('heading',{name:'YOUR INNER CIRCLE.'})).toBeVisible();
});
test('unconfirmed login allows resend and never shows the rewards dashboard',async({page})=>{
  const calls=await mockProject(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/verification-fixture.html#/login');
  await page.getByLabel('Email address or username',{exact:true}).fill('member@example.com');
  await page.getByLabel('Password',{exact:true}).fill('SamplePassword123');
  await page.getByRole('button',{name:'LOG IN'}).click();
  await expect(page.getByRole('heading',{name:'VERIFY YOUR EMAIL.'})).toBeVisible();
  await page.getByRole('button',{name:'RESEND CODE'}).click();
  await expect(page.getByRole('status').filter({hasText:'new code'})).toBeVisible();
  await expect(page.getByRole('button',{name:'RESEND CODE'})).toBeDisabled();
  expect(calls.filter(c=>c.path==='/auth/v1/resend').map(c=>c.body)).toEqual([expect.objectContaining({type:'signup',email:'member@example.com'})]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await expect(page.locator('#page-loader')).toBeHidden();
  await page.screenshot({path:'test-results/email-verification-mobile.png',fullPage:true});
  await page.goto('/verification-fixture.html#/account');
  await expect(page.getByRole('heading',{name:'WELCOME BACK.'})).toBeVisible();
});
