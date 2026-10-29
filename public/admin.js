import { login, logout, getUser, handleAuthCallback, requestPasswordRecovery, updateUser, acceptInvite } from "/vendor/identity.js";
const $=id=>document.getElementById(id),money=n=>"Rs. "+Number(n).toLocaleString("en-PK"),esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let products=[],orders=[],messages=[],currentPhone="";
async function api(url,opts={}){await getUser();let r=await fetch(url,{...opts,headers:{...(opts.body&&!(opts.body instanceof FormData)?{"Content-Type":"application/json"}:{ }),...(opts.headers||{})}});let d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Request failed");return d}
let inviteToken = null;
function authMessage(message, error = false) {
  $("authStatus").textContent = message;
  $("authStatus").classList.toggle("error", error);
}
function authView(view) {
  for (const id of ["loginForm", "recoveryForm", "passwordForm"]) $(id).classList.toggle("hidden", id !== view);
  $("loginError").textContent = "";
  authMessage("");
}
async function busy(form, action) {
  const button = form.querySelector('button[type="submit"], button.gold');
  button.disabled = true;
  form.setAttribute("aria-busy", "true");
  try { await action(); } catch (error) {
    authMessage(error.status === 401 || error.status === 400 ? "Unable to sign in. Check your email and password, or use Forgot password. Recovery links can expire; request a new one if needed." : error.message || "Unable to connect. Please try again.", true);
  } finally { button.disabled = false; form.removeAttribute("aria-busy"); }
}
async function boot() {
  try {
    await getUser();
    const me = await api("/api/admin/me");
    $("loginWrap").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("adminEmail").textContent = me.email;
    showTab("dashboard");
    await loadDashboard();
  } catch (error) {
    $("loginWrap").classList.remove("hidden");
    $("app").classList.add("hidden");
    if (error.message !== "Please sign in to the owner panel.") authMessage(error.message, true);
  }
}
$("loginForm").onsubmit = e => {
  e.preventDefault();
  return busy(e.target, async () => {
    const f = new FormData(e.target);
    await login(String(f.get("email")).trim(), String(f.get("password")));
    e.target.reset();
    authMessage("");
    await boot();
  });
};
$("forgotPassword").onclick = () => {
  const email = $("loginForm").elements.email.value;
  authView("recoveryForm");
  $("recoveryForm").elements.email.value = email;
  $("recoveryForm").elements.email.focus();
};
$("backToLogin").onclick = () => authView("loginForm");
$("recoveryForm").onsubmit = e => {
  e.preventDefault();
  return busy(e.target, async () => {
    await requestPasswordRecovery(e.target.elements.email.value.trim());
    authMessage("If an account exists for that email, a reset link is on its way. Check your inbox and spam folder. Open the email link to choose a new password.");
  });
};
$("passwordForm").onsubmit = e => {
  e.preventDefault();
  return busy(e.target, async () => {
    const password = e.target.elements.password.value;
    if (password.length < 12) throw new Error("Use at least 12 characters.");
    if (password !== e.target.elements.confirm.value) throw new Error("Passwords do not match.");
    if (inviteToken) { await acceptInvite(inviteToken, password); inviteToken = null; }
    else await updateUser({ password });
    e.target.reset();
    authView("loginForm");
    authMessage("Password saved. Your account is ready.");
    await boot();
  });
};
$("logout").onclick = async () => {
  try { await logout(); location.reload(); }
  catch (error) { alert("Could not sign out. Please try again."); }
};
async function initializeAuth() {
  try {
    const callback = await handleAuthCallback();
    if (callback?.type === "recovery" || callback?.type === "invite") {
      inviteToken = callback.type === "invite" ? callback.token : null;
      // Remove token-bearing history even when an invitation is still pending.
      history.replaceState(null, "", location.pathname + location.search);
      authView("passwordForm");
      $("passwordTitle").textContent = inviteToken ? "Set your owner password" : "Choose a new password";
      $("passwordForm").elements.password.focus();
      return;
    }
    await boot();
  } catch (error) {
    history.replaceState(null, "", location.pathname + location.search);
    authView("loginForm");
    authMessage("This access link is invalid or has expired. Use Forgot password to request a new link, or ask the site owner to resend your invitation.", true);
  }
}
document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
function showTab(tab){document.querySelectorAll(".pane").forEach(p=>p.classList.add("hidden"));$(tab).classList.remove("hidden");document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));$("pageTitle").textContent=({dashboard:"Dashboard",products:"Products",orders:"Orders",messages:"Customer chat",settings:"Bank & settings"})[tab];if(tab==="products")loadProducts();if(tab==="orders")loadOrders();if(tab==="messages")loadMessages();if(tab==="settings")loadSettings()}
async function loadDashboard(){let d=await api("/api/admin/summary");$("stats").innerHTML=[["Total products",d.products],["Total orders",d.orders],["Pending orders",d.pending],["Sales (confirmed+)",money(d.revenue)],["Unread messages",d.unread]].map(x=>`<div class="stat"><small>${x[0]}</small><b>${x[1]}</b></div>`).join("")}
async function loadProducts(){products=await api("/api/admin/products");$("productList").innerHTML=products.length?products.map(p=>`<div class="productrow"><div><img src="${esc(p.image||"/tshirt-collection.png")}" onerror="this.src='/tshirt-collection.png'"><b>${esc(p.name)}</b><small> · ${esc(p.category)}</small></div><div>${money(p.price)}<br><small>Stock: ${p.stock} · ${p.active?"Visible":"Hidden"}</small></div><div><button class="smallbtn" data-edit="${p.id}">Edit</button> <button class="danger" data-del="${p.id}">Delete</button></div></div>`).join(""):"No products yet. Add your first product.";document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editProduct(+b.dataset.edit));document.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>deleteProduct(+b.dataset.del))}
$("newProduct").onclick=()=>{let f=$("productForm");f.reset();f.elements.id.value="";f.elements.stock.value=10;f.elements.image.value="";$("editorTitle").textContent="Add product";$("productEditor").classList.remove("hidden");$("productError").textContent=""};
$("cancelEditor").onclick=()=>$("productEditor").classList.add("hidden");
function editProduct(id){let p=products.find(x=>x.id===id),f=$("productForm");if(!p)return;for(let k of ["id","name","category","price","description","image","stock"])if(f.elements[k])f.elements[k].value=p[k]??"";$("editorTitle").textContent="Edit product";$("productEditor").classList.remove("hidden");$("productError").textContent=""}
$("productForm").onsubmit=async e=>{e.preventDefault();let f=e.target;try{let image=f.elements.image.value.trim();if(f.elements.imageFile.files[0]){let fd=new FormData();fd.append("image",f.elements.imageFile.files[0]);image=(await api("/api/admin/upload",{method:"POST",body:fd})).image}let data={name:f.elements.name.value,category:f.elements.category.value,price:f.elements.price.value,description:f.elements.description.value,image,stock:f.elements.stock.value,active:true};let id=f.elements.id.value;await api(id?"/api/admin/products/"+id:"/api/admin/products",{method:id?"PUT":"POST",body:JSON.stringify(data)});$("productEditor").classList.add("hidden");await loadProducts();loadDashboard()}catch(err){$("productError").textContent=err.message}};
async function deleteProduct(id){if(!confirm("Delete this product?"))return;try{await api("/api/admin/products/"+id,{method:"DELETE"});loadProducts();loadDashboard()}catch(e){alert(e.message)}}
async function loadOrders(){orders=await api("/api/admin/orders");$("orderList").innerHTML=orders.length?orders.map(o=>`<div class="orderrow"><div><b>${esc(o.order_code)}</b><br>${esc(o.customer_name)} · ${esc(o.phone)}<br><small>${esc(o.address)}<br>${esc(o.items_json)}</small></div><div><b>${money(o.total)}</b><br><small>${esc(o.payment_method)} · ${esc(o.created_at)}</small></div><div><select data-status="${o.id}">${["Pending","Confirmed","Processing","Shipped","Delivered","Cancelled"].map(s=>`<option ${o.status===s?"selected":""}>${s}</option>`).join("")}</select><select data-pay="${o.id}">${["Unpaid","Awaiting Verification","Paid","Refunded"].map(s=>`<option ${o.payment_status===s?"selected":""}>${s}</option>`).join("")}</select><button class="smallbtn" data-saveorder="${o.id}">Save</button></div></div>`).join(""):"No orders yet.";document.querySelectorAll("[data-saveorder]").forEach(b=>b.onclick=async()=>{let id=b.dataset.saveorder;try{await api("/api/admin/orders/"+id,{method:"PATCH",body:JSON.stringify({status:document.querySelector(`[data-status="${id}"]`).value,payment_status:document.querySelector(`[data-pay="${id}"]`).value})});alert("Order updated.");loadDashboard()}catch(e){alert(e.message)}})}
async function loadMessages(){messages=await api("/api/admin/messages");let phones=[...new Map(messages.map(m=>[m.phone,m])).values()];$("conversationList").innerHTML=phones.length?phones.map(m=>`<button class="messagerow" data-phone="${esc(m.phone)}"><b>${esc(m.customer_name)}</b><small>${esc(m.phone)}</small><span>Open chat →</span></button>`).join(""):"No customer messages yet.";document.querySelectorAll("[data-phone]").forEach(b=>b.onclick=()=>openConversation(b.dataset.phone))}
function openConversation(phone){currentPhone=phone;let arr=messages.filter(m=>m.phone===phone);$("conversation").innerHTML=`<h3>${esc(arr[0]?.customer_name||"Customer")} · ${esc(phone)}</h3>`+arr.map(m=>`<div class="msg ${m.sender==="admin"?"admin":""}">${esc(m.message)}<small>${m.sender==="admin"?"You":"Customer"} · ${esc(m.created_at)}</small></div>`).join("");$("conversation").scrollTop=$("conversation").scrollHeight}
$("replyForm").onsubmit=async e=>{e.preventDefault();if(!currentPhone)return alert("Choose a customer conversation first.");try{await api("/api/admin/messages/reply",{method:"POST",body:JSON.stringify({phone:currentPhone,message:$("replyText").value})});$("replyText").value="";await loadMessages();openConversation(currentPhone)}catch(err){alert(err.message)}};
async function loadSettings(){let d=await api("/api/admin/settings"),f=$("settingsForm");for(let k of ["shop_name","whatsapp_number","bank_name","account_title","account_number","iban","payment_instructions"])f.elements[k].value=d[k]||"";f.elements.bank_enabled.checked=d.bank_enabled}
$("settingsForm").onsubmit=async e=>{e.preventDefault();let f=e.target,d={};for(let k of ["shop_name","whatsapp_number","bank_name","account_title","account_number","iban","payment_instructions"])d[k]=f.elements[k].value;d.bank_enabled=f.elements.bank_enabled.checked;try{await api("/api/admin/settings",{method:"PUT",body:JSON.stringify(d)});$("settingsResult").textContent="Settings saved."}catch(err){$("settingsResult").textContent=err.message}}
initializeAuth();
