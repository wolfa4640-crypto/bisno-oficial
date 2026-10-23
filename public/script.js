

"use strict";



/* =========================================================

   BISNO — SCRIPT PRINCIPAL

   Catálogo, autenticação, anúncios, interesses e chat

   ========================================================= */



let utilizadorAtual = null;

let todosProdutos = [];

let vendedorPublicoAtual = null;

let conversaAtual = null;

let intervaloChat = null;

let paginaAnteriorDetalhes = "area-produtos";

let paginaAnteriorPerfilPublico = "area-produtos";



const $ = (seletor, raiz = document) => raiz.querySelector(seletor);



const LIMITE_IMAGEM = 5 * 1024 * 1024;



const IMAGEM_PADRAO =

  "data:image/svg+xml;charset=UTF-8," +

  encodeURIComponent(`

    <svg xmlns="http\://www\.w3.org/2000/svg" width="500" height="350">

      <rect width="100%" height="100%" fill="#edf2ee"/>

      <text x="50%" y="48%" text-anchor="middle"

        font-family="Arial" font-size="26" fill="#64746a">

        Bisno

      </text>

      <text x="50%" y="60%" text-anchor="middle"

        font-family="Arial" font-size="15" fill="#64746a">

        Sem fotografia

      </text>

    </svg>

  `);



/* =========================================================

   UTILITÁRIOS

   ========================================================= */



function escaparHTML(valor) {

  return String(valor ?? "").replace(/[&<>"']/g, caractere => ({

    "&": "&amp;",

    "<": "&lt;",

    ">": "&gt;",

    '"': "&quot;",

    "'": "&#39;"

  })[caractere]);

}



function numero(valor) {

  const resultado = Number(valor);

  return Number.isFinite(resultado) ? resultado : 0;

}



function formatarPreco(valor) {

  return new Intl.NumberFormat("pt-AO", {

    maximumFractionDigits: 2

  }).format(numero(valor)) + " Kz";

}



function formatarData(valor) {

  if (!valor) return "";



  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) return String(valor);



  return data.toLocaleString("pt-AO", {

    dateStyle: "short",

    timeStyle: "short"

  });

}



function obterIdProduto(produto) {

  return produto?.id ?? produto?.product_id ?? "";

}



function obterIdVendedor(produto) {

  return produto?.user_id ?? produto?.seller_id ?? "";

}



function obterImagem(caminho) {

  if (!caminho) return IMAGEM_PADRAO;



  if (/^(https?:\/\/|data:image\/)/i.test(caminho)) {

    return caminho;

  }



  return caminho.startsWith("/")

    ? caminho

    : "/" + caminho.replace(/^\.\//, "");

}



function mostrarMensagem(texto, tipo = "info") {

  const elemento = $("#mensagem");

  if (!elemento) {

    console.log(texto);

    return;

  }



  elemento.textContent = texto;

  elemento.dataset.tipo = tipo;

  elemento.hidden = false;



  elemento.scrollIntoView({

    behavior: "smooth",

    block: "nearest"

  });

}



function esconderMensagem() {

  const elemento = $("#mensagem");

  if (!elemento) return;



  elemento.textContent = "";

  elemento.hidden = true;

}



function definirConteudo(seletor, html) {

  const elemento = $(seletor);

  if (elemento) elemento.innerHTML = html;

}



function definirTexto(seletor, texto) {

  const elemento = $(seletor);

  if (elemento) elemento.textContent = texto ?? "";

}



async function pedidoAPI(url, opcoes = {}) {

  const controladorTimeout = !opcoes.signal && typeof AbortController !== "undefined" ? new AbortController() : null;
  const temporizadorTimeout = controladorTimeout ? setTimeout(() => controladorTimeout.abort(), 15000) : null;
  const configuracao = {
    credentials: "same-origin",
    ...opcoes,
    ...(controladorTimeout ? { signal: controladorTimeout.signal } : {}),
    headers: { ...(opcoes.headers || {}) }
  }



  if (

    configuracao.body &&

    !(configuracao.body instanceof FormData) &&

    typeof configuracao.body !== "string"

  ) {

    configuracao.headers["Content-Type"] = "application/json";

    configuracao.body = JSON.stringify(configuracao.body);

  }



  configuracao.cache = "no-store";
  let resposta;
  try {
    resposta = await fetch(url, configuracao);
  } catch (erro) {
    if (controladorTimeout?.signal.aborted) throw new Error("O servidor demorou demasiado a responder. Tenta novamente.");
    throw erro;
  } finally {
    if (temporizadorTimeout) clearTimeout(temporizadorTimeout);
  }



  const tipo = resposta.headers.get("content-type") || "";

  let dados;



  if (tipo.includes("application/json")) {

    dados = await resposta.json();

  } else {

    dados = await resposta.text();

  }



  if (!resposta.ok) {

    const mensagem =

      typeof dados === "object" && dados

        ? dados.erro || dados.mensagem || dados.message

        : dados;



    const erro = new Error(

      mensagem || `O pedido falhou (${resposta.status}).`

    );



    erro.status = resposta.status;

    throw erro;

  }



  return dados;

}



function exigirLogin() {

  if (utilizadorAtual) return true;



  mostrarAba("login");

  $("#area-autenticacao")?.scrollIntoView({

    behavior: "smooth",

    block: "start"

  });



  mostrarMensagem(

    "Inicia sessão para utilizares esta funcionalidade.",

    "aviso"

  );



  return false;

}



function obterIdUtilizador() {

  return utilizadorAtual?.id ??

    utilizadorAtual?.user?.id ??

    utilizadorAtual?.userId ??

    null;

}



function nomeUtilizadorAtual() {

  return utilizadorAtual?.name ??

    utilizadorAtual?.nome ??

    utilizadorAtual?.user?.name ??

    "Utilizador";

}



/* =========================================================

   NAVEGAÇÃO

   ========================================================= */



function abrirPagina(id) {
  const autenticado = Boolean(utilizadorAtual);
  document.body.classList.toggle("bisno-autenticado", autenticado);
  document.body.classList.toggle("bisno-requer-login", !autenticado);

  // Sem sessão, qualquer destino privado ou o catálogo redireciona para autenticação.
  if (!autenticado && id !== "area-autenticacao") id = "area-autenticacao";

  const hero = document.querySelector(".hero-bisno");
  const auth = document.getElementById("area-autenticacao");
  const account = document.getElementById("area-conta");
  const products = document.getElementById("area-produtos");
  const messages = document.getElementById("area-mensagens");
  const publish = document.getElementById("area-publicar");
  const profile = document.getElementById("perfil-vendedor");
  const myAds = document.getElementById("area-meus-anuncios");
  const notifications = document.getElementById("area-notificacoes");
  const store = document.getElementById("area-loja");
  const storeDirectory = document.getElementById("area-diretorio-lojas");
  const wanted = document.getElementById("area-pedidos-procura");
  const productDetails = document.getElementById("detalhes-produto");
  const publicProfile = document.getElementById("perfil-publico");
  const footer = document.querySelector("body > footer");

  const destinosConta = ["area-conta", "area-meus-anuncios", "area-publicar", "area-mensagens", "area-notificacoes", "area-loja"];
  const dentroDaConta = destinosConta.includes(id);

  if (hero) hero.hidden = id !== "area-produtos";
  if (auth) auth.hidden = id !== "area-autenticacao";
  if (products) products.hidden = id !== "area-produtos";
  if (account) account.hidden = !autenticado || !dentroDaConta;
  if (messages) messages.hidden = id !== "area-mensagens";
  if (publish) publish.hidden = id !== "area-publicar";
  if (profile) profile.hidden = id !== "area-conta";
  if (myAds) myAds.hidden = id !== "area-meus-anuncios";
  if (notifications) notifications.hidden = id !== "area-notificacoes";
  if (store) store.hidden = id !== "area-loja";
  if (storeDirectory) storeDirectory.hidden = id !== "area-diretorio-lojas";
  if (wanted) wanted.hidden = id !== "area-pedidos-procura";
  if (productDetails) productDetails.hidden = id !== "detalhes-produto";
  if (publicProfile) publicProfile.hidden = id !== "perfil-publico";
  if (footer) footer.hidden = id !== "area-produtos";

  // Dentro do contentor da conta, mostrar somente a secção escolhida.
  if (account) {
    Array.from(account.children).forEach(child => {
      if (["area-notificacoes", "area-mensagens", "area-loja", "area-publicar", "perfil-vendedor", "area-meus-anuncios"].includes(child.id)) {
        if (child.id === "area-meus-anuncios") child.hidden = id !== "area-meus-anuncios";
        else child.hidden = child.id !== id && !(child.id === "perfil-vendedor" && id === "area-conta");
      } else if (child.id === "bisno-account-summary") {
        child.hidden = id !== "area-conta";
      } else if (child.id === "botao-sair") {
        child.hidden = id !== "area-conta";
      } else if (child.tagName === "HR") {
        child.hidden = id !== "area-conta";
      } else if (child.classList.contains("dados-conta") || child.tagName === "H2" || child.tagName === "P") {
        child.hidden = id !== "area-conta";
      }
    });
  }

  document.querySelectorAll("[data-bisno-page]").forEach(link => {
    const page = link.dataset.bisnoPage;
    const active = (page === "home" && id === "area-produtos") ||
      (page === "messages" && id === "area-mensagens") ||
      (page === "notifications" && id === "area-notificacoes") ||
      (page === "publish" && id === "area-publicar") ||
      (page === "profile" && id === "area-conta") ||
      (page === "listings" && id === "area-meus-anuncios") ||
      (page === "store" && id === "area-loja") ||
      (page === "stores" && id === "area-diretorio-lojas");
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  // Reintegra explicitamente o painel de publicação no contentor da conta.
  // Alguns estilos/componentes antigos podem deixar a secção ou o contentor ocultos
  // após uma navegação anterior; garantir ambos os estados evita um painel vazio.
  if (id === "area-publicar" && autenticado) {
    if (account) account.hidden = false;
    if (publish) {
      publish.hidden = false;
      publish.style.removeProperty("display");
      publish.setAttribute("aria-hidden", "false");
    }
    const formAnuncio = document.getElementById("form-anuncio");
    if (formAnuncio) {
      formAnuncio.hidden = false;
      formAnuncio.style.removeProperty("display");
    }
  } else if (publish) {
    publish.setAttribute("aria-hidden", String(publish.hidden));
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
  if (id === "area-publicar" && autenticado) {
    window.requestAnimationFrame(() => {
      const formAnuncio = document.getElementById("form-anuncio");
      formAnuncio?.scrollIntoView({ behavior: "smooth", block: "start" });
      formAnuncio?.querySelector('input[name="name"]')?.focus({ preventScroll: true });
    });
  }
}

function mostrarAba(aba) {
  const formularios = { login: $("#form-login"), registo: $("#form-registo"), recuperar: $("#form-recuperar-password") };
  Object.entries(formularios).forEach(([nome, formulario]) => { if (formulario) formulario.hidden = nome !== aba; });
  $("#aba-login")?.classList.toggle("ativa", aba === "login");
  $("#aba-registo")?.classList.toggle("ativa", aba === "registo");
  $("#aba-login")?.setAttribute("aria-pressed", String(aba === "login"));
  $("#aba-registo")?.setAttribute("aria-pressed", String(aba === "registo"));
}

function configurarNavegacao() {
  $("#aba-login")?.addEventListener("click", () => mostrarAba("login"));
  $("#aba-registo")?.addEventListener("click", () => mostrarAba("registo"));

  document.querySelectorAll("[data-bisno-page]").forEach(link => {
    link.addEventListener("click", evento => {
      evento.preventDefault();
      const page = link.dataset.bisnoPage;
      if (page === "home") abrirPagina("area-produtos");
      else if (page === "stores") {
        if (utilizadorAtual) { abrirPagina("area-diretorio-lojas"); carregarDiretorioLojas(); }
        else { mostrarAba("login"); abrirPagina("area-autenticacao"); }
      }
      else if (page === "wanted") {
        if (utilizadorAtual) { abrirPagina("area-pedidos-procura"); window.bisnoCarregarPedidosProcura?.(); }
        else { mostrarAba("login"); abrirPagina("area-autenticacao"); }
      }
      else if (page === "messages") {
        if (utilizadorAtual) { abrirPagina("area-mensagens"); atualizarConversas(); }
        else { mostrarAba("login"); abrirPagina("area-autenticacao"); }
      } else if (page === "notifications") {
        if (utilizadorAtual) { abrirPagina("area-notificacoes"); abrirNotificacoesEMarcarLidas(); }
        else { mostrarAba("login"); abrirPagina("area-autenticacao"); }
      } else if (page === "publish") {
        if (utilizadorAtual) abrirPagina("area-publicar");
        else { mostrarAba("registo"); abrirPagina("area-autenticacao"); }
      } else if (page === "listings") {
        if (utilizadorAtual) { abrirPagina("area-meus-anuncios"); carregarMeusAnuncios(); }
        else { mostrarAba("login"); abrirPagina("area-autenticacao"); }
      } else if (page === "store") {
        if (utilizadorAtual) { abrirPagina("area-loja"); carregarMinhaLoja(); }
        else { mostrarAba("login"); abrirPagina("area-autenticacao"); }
      } else if (page === "profile") {
        if (utilizadorAtual) abrirPagina("area-conta");
        else { mostrarAba("login"); abrirPagina("area-autenticacao"); }
      }
    });
  });

  document.querySelectorAll('a[href="#area-autenticacao"]').forEach(link => {
    link.addEventListener("click", evento => {
      evento.preventDefault(); mostrarAba("registo"); abrirPagina("area-autenticacao");
    });
  });
  document.querySelectorAll('a[href="#area-produtos"]:not([data-bisno-page])').forEach(link => {
    link.addEventListener("click", evento => { evento.preventDefault(); abrirPagina("area-produtos"); });
  });
  document.querySelectorAll('a[href="#area-conta"]:not([data-bisno-page])').forEach(link => {
    link.addEventListener("click", evento => {
      evento.preventDefault();
      if (utilizadorAtual) abrirPagina("area-conta");
      else { mostrarAba("login"); abrirPagina("area-autenticacao"); }
    });
  });
}

/* =========================================================

   AUTENTICAÇÃO E CONTA

   ========================================================= */



function atualizarPerfil() {

  if (!utilizadorAtual) return;



  definirTexto("#nome-utilizador", nomeUtilizadorAtual());

  definirTexto(

    "#email-utilizador",

    utilizadorAtual.email ?? utilizadorAtual.user?.email ?? ""

  );

  definirTexto(

    "#telefone-utilizador",

    utilizadorAtual.phone ?? utilizadorAtual.telefone ?? ""

  );



  const nomeInput = $("#perfil-nome-input");

  const telefoneInput = $("#perfil-telefone-input");



  if (nomeInput) nomeInput.value = nomeUtilizadorAtual();



  if (telefoneInput) {

    telefoneInput.value =

      utilizadorAtual.phone ?? utilizadorAtual.telefone ?? "";

  }



  const foto = $("#foto-perfil");
  const semFoto = $("#perfil-sem-foto");
  if (foto && utilizadorAtual.avatar) { foto.src = obterImagem(utilizadorAtual.avatar); foto.hidden = false; if (semFoto) semFoto.hidden = true; }
  else {
    if (foto) { foto.hidden = true; foto.removeAttribute("src"); }
    if (semFoto) { const nome = String(nomeUtilizadorAtual() || utilizadorAtual.name || "").trim(); semFoto.textContent = nome ? Array.from(nome)[0].toLocaleUpperCase("pt-AO") : "?"; semFoto.hidden = false; }
  }
  const cover = $("#perfil-capa-preview");
  if (cover) { cover.style.backgroundImage = utilizadorAtual.cover ? 'url("' + obterImagem(utilizadorAtual.cover).replace(/"/g, "%22") + '")' : ""; cover.classList.toggle("tem-capa", Boolean(utilizadorAtual.cover)); }

  definirTexto("#perfil-nome", nomeUtilizadorAtual());

  definirTexto("#perfil-nome-utilizador", nomeUtilizadorAtual());
}



function mostrarConta() {
  const conta = $("#area-conta");
  const autenticacao = $("#area-autenticacao");
  const autenticado = Boolean(utilizadorAtual);

  document.body.classList.toggle("bisno-autenticado", autenticado);
  document.body.classList.toggle("bisno-requer-login", !autenticado);
  // A sessão só controla autenticação; a navegação decide qual painel fica visível.
  // Não reabrir #area-conta automaticamente ao atualizar a página.
  if (conta && !autenticado) conta.hidden = true;
  if (autenticacao) autenticacao.hidden = autenticado;

  if (autenticado) {
    atualizarPerfil();
    if ($("#admin-abrir")) $("#admin-abrir").hidden = !Boolean(utilizadorAtual.isAdmin);
    atualizarAreasSociais();
    carregarMeusAnuncios().catch(console.error);
  } else {
    const overlay = $("#painel-pesquisa-overlay");
    if (overlay) overlay.hidden = true;
    $("#botao-abrir-pesquisa")?.setAttribute("aria-expanded", "false");
    fecharChat();
  }
}


async function verificarSessao() {
  try {
    const dados = await pedidoAPI("/api/auth/me");
    utilizadorAtual = dados.utilizador ?? dados.usuario ?? dados.user ?? (dados.id ? dados : null);
    document.body.classList.toggle("bisno-autenticado", Boolean(utilizadorAtual));
  // Mantém o catálogo de vendedores e os pedidos de compradores em secções separadas.
    document.body.classList.toggle("bisno-sem-sessao", !utilizadorAtual);
    mostrarConta();
    if (utilizadorAtual) {
      carregarMeusAnuncios().catch(() => {});
      atualizarNotificacoes().catch(() => {});
      atualizarConversas().catch(() => {});
    }
    return utilizadorAtual;
  } catch (erro) {
    // Só terminar a sessão visual quando o servidor confirmar que ela não existe.
    // Falhas temporárias de rede/5xx não devem expulsar o utilizador nem esconder o catálogo.
    if (erro.status === 401 || erro.status === 404) {
      utilizadorAtual = null;
      document.body.classList.remove("bisno-autenticado");
      document.body.classList.add("bisno-sem-sessao");
      mostrarConta();
      return null;
    }
    console.warn("Falha temporária ao verificar a sessão; vou preservar o estado atual:", erro.message);
    if (utilizadorAtual) {
      document.body.classList.add("bisno-autenticado");
      document.body.classList.remove("bisno-sem-sessao");
      mostrarConta();
      carregarProdutos().catch(() => {});
      carregarMeusAnuncios().catch(() => {});
      atualizarNotificacoes().catch(() => {});
      atualizarConversas().catch(() => {});
      return utilizadorAtual;
    }
    // Sem estado local inicial, não inventar uma sessão: permitir nova tentativa.
    document.body.classList.add("bisno-sem-sessao");
    mostrarConta();
    return null;
  }
}


async function registarUtilizador(evento) {
  evento.preventDefault();
  const formulario = evento.currentTarget, botao = formulario.querySelector('button[type="submit"]');
  if (formulario.dataset.enviando === "true") return;
  formulario.dataset.enviando = "true"; if (botao) { botao.disabled = true; botao.textContent = "A criar conta…"; }
  try {
    const dados = Object.fromEntries(new FormData(formulario).entries());
    const resposta = await pedidoAPI("/api/auth/register", { method: "POST", body: dados });
    formulario.reset(); mostrarAba("login");
    if ($("#login-email")) $("#login-email").value = dados.email;
    if ($("#login-password")) $("#login-password").value = dados.password;
    mostrarMensagem(resposta.mensagem || "Conta criada com sucesso. Já podes iniciar sessão.", "sucesso");
  } catch (erro) { mostrarMensagem(erro.message || "Não foi possível criar a conta.", "erro"); }
  finally { delete formulario.dataset.enviando; if (botao) { botao.disabled = false; botao.textContent = "Criar conta"; } }
}


async function entrarUtilizador(evento) {
  // Impede o envio HTML tradicional, que recarregaria a página e apagaria os campos.
  evento.preventDefault();
  const formulario = evento.currentTarget;
  if (!formulario || formulario.dataset.enviando === "true") return;

  esconderMensagem();

  const campoEmail = $("#login-email");
  const campoPassword = $("#login-password");
  const botaoEnviar = formulario.querySelector('button[type="submit"]');
  const email = String(campoEmail?.value || "").trim().toLowerCase();
  const password = String(campoPassword?.value || "");

  if (!email || !password) {
    mostrarMensagem("Introduz o teu e-mail e a palavra-passe.", "aviso");
    (!email ? campoEmail : campoPassword)?.focus();
    return;
  }

  formulario.dataset.enviando = "true";
  if (botaoEnviar) {
    botaoEnviar.disabled = true;
    botaoEnviar.dataset.textoOriginal = botaoEnviar.textContent;
    botaoEnviar.textContent = "A entrar…";
  }

  try {
    const resposta = await pedidoAPI("/api/auth/login", {
      method: "POST",
      body: { email, password }
    });

    utilizadorAtual =
      resposta?.utilizador ??
      resposta?.usuario ??
      resposta?.user ??
      (resposta?.id ? resposta : null);

    // Confirmar que o cookie de sessão funciona também em navegadores móveis.
    const sessao = await pedidoAPI("/api/auth/me");
    utilizadorAtual =
      sessao?.utilizador ??
      sessao?.usuario ??
      sessao?.user ??
      (sessao?.id ? sessao : null);

    if (!utilizadorAtual) {
      throw new Error("A sessão não foi confirmada. Verifica os teus dados e tenta novamente.");
    }

    document.body.classList.add("bisno-autenticado");
    document.body.classList.remove("bisno-sem-sessao");
    mostrarConta();
    const lojaPartilhada = new URLSearchParams(window.location.search).get("loja");
    if (lojaPartilhada) { abrirPagina("area-diretorio-lojas"); await abrirDetalheLoja(lojaPartilhada); }
    else abrirPagina("area-produtos");
    mostrarMensagem("Sessão iniciada com sucesso!", "sucesso");
    // Limpar apenas depois de confirmar sessão no servidor.
    formulario.reset();
    carregarProdutos().catch(erro => console.error("Erro ao carregar anúncios:", erro));
    carregarCategoriasProdutos().catch(() => {});
  } catch (erro) {
    // Preservar os valores para que a pessoa não tenha de os escrever novamente.
    mostrarMensagem(erro.message || "Não foi possível iniciar sessão. Tenta novamente.", "erro");
    if (campoPassword) {
      campoPassword.focus();
      campoPassword.select();
    }
  } finally {
    delete formulario.dataset.enviando;
    if (botaoEnviar) {
      botaoEnviar.disabled = false;
      botaoEnviar.textContent = botaoEnviar.dataset.textoOriginal || "Entrar";
      delete botaoEnviar.dataset.textoOriginal;
    }
  }
}


async function guardarPerfil(evento) {

  evento.preventDefault();

  if (!exigirLogin()) return;



  const formulario = evento.currentTarget;

  const dados = new FormData(formulario);
  const fotoSelecionada = $("#perfil-foto-input")?.files?.[0];
  const capaSelecionada = $("#perfil-capa-input")?.files?.[0];
  if (fotoSelecionada) dados.append("avatar", fotoSelecionada);
  if (capaSelecionada) dados.append("cover", capaSelecionada);
  const ficheiros = [fotoSelecionada, capaSelecionada].filter(Boolean);



  if (ficheiros.some(ficheiro => ficheiro.size > LIMITE_IMAGEM)) {

    mostrarMensagem("Cada imagem do perfil deve ter no máximo 5 MB.", "erro");

    return;

  }



  try {

    const resposta = await pedidoAPI("/api/auth/profile", {

      method: "PUT",

      body: dados

    });



    utilizadorAtual =

      resposta.utilizador ??

      resposta.usuario ??

      resposta.user ??

      utilizadorAtual;



    atualizarPerfil();

    mostrarMensagem("Perfil atualizado com sucesso.", "sucesso");

  } catch (erro) {

    mostrarMensagem(

      erro.message || "Não foi possível atualizar o perfil.",

      "erro"

    );

  }

}



async function terminarSessao() {
  try { await pedidoAPI("/api/auth/logout", { method: "POST" }); }
  catch (erro) { console.warn("Erro ao terminar sessão no servidor:", erro.message); }
  fecharChat();
  utilizadorAtual = null;
  document.body.classList.remove("bisno-autenticado");
  document.body.classList.add("bisno-sem-sessao");
  mostrarConta();
  mostrarAba("login");
  abrirPagina("area-autenticacao");
  todosProdutos = [];
  definirConteudo("#lista-produtos", "<p>Inicia sessão ou cria uma conta para ver os anúncios.</p>");
  mostrarMensagem("Terminaste a sessão.", "sucesso");
}


/* =========================================================

   ANÚNCIOS

   ========================================================= */



async function publicarAnuncio(evento) {
  evento.preventDefault();
  evento.stopPropagation();
  const form = evento.currentTarget;
  if (form.dataset.enviando === "true" || !exigirLogin()) return;
  if (!form.reportValidity()) return;

  const campoImagem = form.querySelector('input[name="image"]');
  const ficheiro = campoImagem?.files?.[0];
  if (ficheiro && (!["image/jpeg", "image/png", "image/webp"].includes(ficheiro.type) || ficheiro.size > LIMITE_IMAGEM)) {
    mostrarMensagem("A imagem deve ser JPG, PNG ou WEBP e não pode ultrapassar 5 MB.", "erro");
    return;
  }
  const stock = Number(form.elements.namedItem("stock")?.value);
  const preco = Number(form.elements.namedItem("price")?.value);
  if (!Number.isSafeInteger(preco) || preco < 0 || preco > 1000000000000 || !Number.isSafeInteger(stock) || stock < 0 || stock > 1000000) {
    mostrarMensagem("Confirma o preço e a quantidade em stock.", "erro");
    return;
  }

  const preview = document.getElementById("anuncio-preview");
  const submit = form.querySelector('button[type="submit"]');
  const textoOriginal = submit?.textContent || "＋ Publicar anúncio";
  const dados = new FormData(form);
  if (!ficheiro || ficheiro.size === 0) dados.delete("image");
  form.dataset.enviando = "true";
  if (submit) { submit.disabled = true; submit.textContent = "A publicar…"; }
  try {
    const resultado = await pedidoAPI("/api/products", { method: "POST", body: dados });
    form.reset();
    if (preview) { preview.hidden = true; preview.replaceChildren(); }
    mostrarMensagem(resultado.mensagem || "Anúncio publicado com sucesso!", "sucesso");
    await carregarProdutos();
    await carregarMeusAnuncios();
    abrirPagina("area-produtos");
  } catch (erro) {
    mostrarMensagem(erro.message || "Não foi possível publicar o anúncio. Confirma os dados e tenta novamente.", "erro");
  } finally {
    delete form.dataset.enviando;
    if (submit) { submit.disabled = false; submit.textContent = textoOriginal; }
  }
}

function configurarPrevisualizacaoAnuncio() {
  const campo = document.getElementById("anuncio-imagem");
  const preview = document.getElementById("anuncio-preview");
  if (!campo || !preview || campo.dataset.configurado === "true") return;
  campo.dataset.configurado = "true";
  let url = null;
  campo.addEventListener("change", () => {
    if (url) URL.revokeObjectURL(url);
    url = null;
    preview.replaceChildren();
    preview.hidden = true;
    const file = campo.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > LIMITE_IMAGEM) {
      campo.value = "";
      mostrarMensagem("A imagem deve ser JPG, PNG ou WEBP e não pode ultrapassar 5 MB.", "erro");
      return;
    }
    url = URL.createObjectURL(file);
    const img = document.createElement("img");
    img.src = url;
    img.alt = "Pré-visualização do produto";
    img.className = "bisno-pedido-imagem";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "240px";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "botao-secundario";
    remove.textContent = "Remover imagem";
    remove.addEventListener("click", () => { campo.value = ""; if (url) URL.revokeObjectURL(url); url = null; preview.replaceChildren(); preview.hidden = true; });
    preview.append(img, remove);
    preview.hidden = false;
  });
}

function eProdutoDoUtilizador(produto) {

  const idUtilizador = obterIdUtilizador();

  return idUtilizador != null &&

    String(obterIdVendedor(produto)) === String(idUtilizador);

}



function cartaoProduto(produto) {
  const id = obterIdProduto(produto);
  const vendedor = produto.seller_name ?? produto.user_name ?? "Vendedor";
  const avatar = produto.seller_avatar ?? "";
  const imagem = obterImagem(produto.image);
  const visualizacoes = Number(produto.views ?? produto.view_count ?? produto.visualizacoes ?? 0);
  const condicao = produto.condition ?? "";
  const stock = Number.isSafeInteger(Number(produto.stock)) ? Number(produto.stock) : 1;
  const categoria = produto.category ?? "";
  const localizacao = [produto.city, produto.neighborhood].filter(Boolean).join(" · ");
  const whatsapp = produto.whatsapp
    ? (() => {
        const n = String(produto.whatsapp).replace(/\D/g, "");
        return n.startsWith("244") ? n : (n.length === 9 ? "244" + n : n);
      })()
    : "";

  return `
    <article class="cartao-produto bisno-product-card" data-produto-id="${escaparHTML(id)}">
      <div class="bisno-product-media">
        <img
          class="imagem-produto"
          role="button"
          tabindex="0"
          title="Ver detalhes do produto"
          src="${escaparHTML(imagem)}"
          alt="${escaparHTML(produto.name)}"
          loading="lazy"
          onerror="this.onerror=null;this.src='${IMAGEM_PADRAO}'"
        >
        <button type="button" class="bisno-card-interest" data-interesse="${escaparHTML(id)}" aria-pressed="false" aria-label="Tenho interesse neste produto" title="Tenho interesse"><span class="bisno-interest-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M8.2 11.1V5.4a1.8 1.8 0 0 1 3.6 0v5.1-6.1a1.7 1.7 0 0 1 3.4 0v6.1-4.2a1.6 1.6 0 0 1 3.2 0v5.2-2.1a1.6 1.6 0 0 1 3.2 0v5.2c0 4.1-2.7 6.8-6.7 6.8h-1.8c-2.3 0-3.7-1-5-2.8l-3-4.1a1.8 1.8 0 0 1 2.9-2.1l2.2 2.4" transform="translate(-1.5 -1) scale(.94)" /></svg></span><span class="bisno-interest-count" data-total-interesses="${escaparHTML(id)}">0</span></button>
        ${visualizacoes > 0 ? `<span class="bisno-views-badge" aria-label="${visualizacoes} visualizações">👁 ${escaparHTML(visualizacoes.toLocaleString("pt-AO"))}</span>` : ""}
        ${condicao ? `<span class="bisno-condition-badge">${escaparHTML(condicao)}</span>` : ""}
      </div>

      <div class="cartao-produto-conteudo bisno-product-info">
        ${categoria ? `<p class="bisno-product-category">${escaparHTML(categoria)}</p>` : ""}
        <h3 title="${escaparHTML(produto.name)}">${escaparHTML(produto.name)}</h3>
        <p class="preco">${escaparHTML(formatarPreco(produto.price))}</p>
        <p class="bisno-stock-indicator" aria-label="${stock === 0 ? "Produto esgotado" : "Stock disponível: " + stock}">${stock === 0 ? "Esgotado" : "📦 Stock: " + stock}</p>
        ${localizacao ? `<p class="bisno-product-location"><span aria-hidden="true">⌖</span> ${escaparHTML(localizacao)}</p>` : ""}
        <div class="bisno-card-actions">
          ${!eProdutoDoUtilizador(produto) ? `<button type="button" class="botao-mensagem" data-iniciar-conversa="${escaparHTML(id)}">Enviar mensagem</button>` : ""}
          ${whatsapp ? `<a class="botao-whatsapp" href="https://wa.me/${escaparHTML(whatsapp)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
        </div>
        <div class="vendedor-resumo vendedor-resumo-mini bisno-seller-row">
          <button type="button" class="avatar-vendedor-clicavel" data-ver-vendedor="${escaparHTML(obterIdVendedor(produto))}" aria-label="Ver perfil de ${escaparHTML(vendedor)}" title="Ver perfil de ${escaparHTML(vendedor)}">
            ${avatar ? `<img src="${escaparHTML(obterImagem(avatar))}" alt="">` : `<span>${escaparHTML((vendedor.trim().charAt(0) || "V").toUpperCase())}</span>`}
          </button>
          <button type="button" class="nome-vendedor-link" data-ver-vendedor="${escaparHTML(obterIdVendedor(produto))}">${escaparHTML(vendedor)}</button>
        </div>
      </div>
    </article>
  `;
}


async function carregarCategoriasProdutos() {
  try {
    const data = await pedidoAPI("/api/products/categories");
    const categories = data.categories || [];
    ["#anuncio-categoria", "#filtro-categoria"].forEach(selector => {
      const select = $(selector);
      if (!select) return;
      const existing = new Set(Array.from(select.options).map(option => option.value.trim().toLocaleLowerCase()));
      categories.forEach(category => {
        const name = String(category.name || "").trim();
        if (!name || existing.has(name.toLocaleLowerCase())) return;
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name + " (" + numero(category.products).toLocaleString("pt-AO") + ")";
        select.appendChild(option);
        existing.add(name.toLocaleLowerCase());
      });
    });
  } catch (error) {
    console.warn("Não foi possível atualizar as categorias:", error.message);
  }
}

async function carregarProdutos() {
  const lista = $("#lista-produtos");
  if (!lista) return;
  lista.setAttribute("aria-busy", "true");
  const contagem = $("#resultado-contagem");
  if (contagem) contagem.textContent = "A carregar anúncios…";
  lista.innerHTML = "<p>A carregar produtos...</p>";

  try {
    const dados = await pedidoAPI("/api/products");
    todosProdutos = dados.produtos ?? dados.products ?? [];
    aplicarFiltros();
    lista.setAttribute("aria-busy", "false");

    todosProdutos.forEach(produto => {
      const id = obterIdProduto(produto);
      carregarEstadoInteresse(id).catch(() => {});
    });
  } catch (erro) {
    lista.innerHTML = `<p role="alert">${escaparHTML(erro.message || "Não foi possível carregar os produtos.")}</p><button type="button" id="bisno-tentar-carregar-produtos">Tentar novamente</button>`;
    $("#bisno-tentar-carregar-produtos")?.addEventListener("click", () => carregarProdutos());
    lista.setAttribute("aria-busy", "false");
    if (contagem) contagem.textContent = "Não foi possível carregar os anúncios. Tenta novamente.";
  }
}


// Carrega os anúncios do utilizador sem depender de funções antigas.
async function carregarMeusAnuncios() {
  // Escrever apenas na grelha de anúncios: nunca substituir a secção inteira do perfil.
  const alvo = $("#lista-meus-anuncios");
  if (!alvo || !utilizadorAtual) return;
  alvo.setAttribute("aria-busy", "true");
  try {
    const dados = await pedidoAPI("/api/products/mine");
    const produtos = dados.produtos ?? dados.products ?? dados.anuncios ?? [];
    alvo.innerHTML = produtos.length
      ? produtos.map(cartaoProduto).join("")
      : "<p>Ainda não publicaste anúncios. Quando publicares, aparecerão aqui.</p>";
  } catch (erro) {
    alvo.innerHTML = "<p>" + escaparHTML(erro.message || "Não foi possível carregar os teus anúncios.") + "</p>";
  } finally {
    alvo.setAttribute("aria-busy", "false");
  }
}

function normalizarTexto(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function aplicarFiltros() {
  const lista = $("#lista-produtos");
  if (!lista) return;

  const pesquisa = normalizarTexto($("#filtro-pesquisa")?.value);
  const categoria = $("#filtro-categoria")?.value ?? "";
  const cidade = normalizarTexto($("#filtro-cidade")?.value);
  const precoMaximo = $("#filtro-preco")?.value;
  const ordenar = $("#ordenar-produtos")?.value ?? "";

  let produtos = todosProdutos.filter(produto => {
    const texto = normalizarTexto([
      produto.name,
      produto.description,
      produto.category,
      produto.city,
      produto.neighborhood
    ].join(" "));

    if (pesquisa && !texto.includes(pesquisa)) return false;
    if (categoria && produto.category !== categoria) return false;

    const localizacao = normalizarTexto(
      [produto.city, produto.neighborhood].filter(Boolean).join(" ")
    );
    if (cidade && !localizacao.includes(cidade)) return false;

    if (
      precoMaximo !== "" &&
      precoMaximo != null &&
      numero(produto.price) > numero(precoMaximo)
    ) {
      return false;
    }

    return true;
  });

  if (ordenar === "menor") {
    produtos.sort((a, b) => numero(a.price) - numero(b.price));
  } else if (ordenar === "maior") {
    produtos.sort((a, b) => numero(b.price) - numero(a.price));
  }

  const resultadoContagem = $("#resultado-contagem");
  if (resultadoContagem) {
    resultadoContagem.textContent = produtos.length === 1
      ? "1 anúncio encontrado"
      : `${produtos.length} anúncios encontrados`;
  }

  if (!produtos.length) {
    lista.innerHTML = `<div class="estado-vazio-catalogo"><p class="estado-vazio-titulo">Não encontrámos anúncios com estes filtros.</p><p>Tenta pesquisar por outras palavras, escolher outra categoria ou limpar os filtros.</p><button type="button" class="botao-limpar-filtros" data-limpar-filtros>Limpar filtros</button></div>`;
    return;
  }

  lista.innerHTML = produtos.map(cartaoProduto).join("");
}

function prepararAreaDetalhes() {

  let area = $("#detalhes-produto");

  if (area) return area;



  area = document.createElement("section");

  area.id = "detalhes-produto";

  area.className = "painel";

  area.hidden = true;



  $("#area-produtos")?.before(area);



  return area;

}



function prepararAreaPerfilPublico() {

  let area = $("#perfil-publico");

  if (area) return area;



  area = document.createElement("section");

  area.id = "perfil-publico";

  area.className = "painel";

  area.hidden = true;



  $("#area-produtos")?.before(area);



  return area;

}



function mostrarAreaPrincipal(id) {

  const detalhes = $("#detalhes-produto");

  const perfil = $("#perfil-publico");



  if (detalhes) detalhes.hidden = id !== "detalhes-produto";

  if (perfil) perfil.hidden = id !== "perfil-publico";



  const conta = $("#area-conta");

  const produtos = $("#area-produtos");



  if (id === "detalhes-produto" || id === "perfil-publico") {

    if (conta) conta.hidden = true;

    if (produtos) produtos.hidden = true;

  } else {

    if (produtos) produtos.hidden = false;

    if (conta) conta.hidden = !utilizadorAtual;

  }

}



async function abrirDetalhes(id) {

  const produto = todosProdutos.find(

    item => String(obterIdProduto(item)) === String(id)

  );



  if (!produto) {

    mostrarMensagem("Não foi possível encontrar este produto.", "erro");

    return;

  }



  paginaAnteriorDetalhes = "area-produtos";



  const area = prepararAreaDetalhes();

  if (!area) return;



  const vendedorId = obterIdVendedor(produto);

  const imagem = obterImagem(produto.image);



  area.innerHTML = `

    <button type="button" id="voltar-detalhes">← Voltar aos produtos</button>



    <article class="detalhe-produto">

      <img

        src="${escaparHTML(imagem)}"

        alt="${escaparHTML(produto.name)}"

        onerror="this.onerror=null;this.src='${IMAGEM_PADRAO}'"

      >



      <div>

        <h2>${escaparHTML(produto.name)}</h2>

        <p class="preco">${escaparHTML(formatarPreco(produto.price))}</p>

        <p>${escaparHTML(produto.description ?? "")}</p>

        <p><strong>Estado:</strong> ${escaparHTML(produto.condition ?? "")}</p>

        <p><strong>Categoria:</strong> ${escaparHTML(produto.category ?? "")}</p>

        <p><strong>Localização:</strong> ${escaparHTML(produto.city ?? "")} — ${escaparHTML(produto.neighborhood ?? "")}</p>



        <button type="button" class="bisno-interest-detail" data-interesse="${escaparHTML(id)}" aria-pressed="false" aria-label="Tenho interesse neste produto">
          <span class="bisno-interest-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M8.2 11.1V5.4a1.8 1.8 0 0 1 3.6 0v5.1-6.1a1.7 1.7 0 0 1 3.4 0v6.1-4.2a1.6 1.6 0 0 1 3.2 0v5.2-2.1a1.6 1.6 0 0 1 3.2 0v5.2c0 4.1-2.7 6.8-6.7 6.8h-1.8c-2.3 0-3.7-1-5-2.8l-3-4.1a1.8 1.8 0 0 1 2.9-2.1l2.2 2.4" transform="translate(-1.5 -1) scale(.94)" /></svg></span>
                    <span class="bisno-interest-count" data-total-interesses="${escaparHTML(id)}">0</span>
        </button>



        <button type="button" data-ver-vendedor="${escaparHTML(vendedorId)}">

          Ver perfil do vendedor

        </button>



        ${!eProdutoDoUtilizador(produto) ? `

          <button type="button" data-iniciar-conversa="${escaparHTML(id)}">

            Enviar mensagem ao vendedor

          </button>

        ` : ""}



        ${produto.whatsapp ? `

          <a

            href="https\://wa.me/${escaparHTML(String(produto.whatsapp).replace(/\D/g, ""))}"

            target="_blank"

            rel="noopener noreferrer"

          >

            <svg class="icone-whatsapp" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M20.52 3.48A11.86 11.86 0 0 0 12.08 0C5.5 0 .15 5.35.15 11.93c0 2.1.55 4.16 1.6 5.97L0 24l6.27-1.64a11.9 11.9 0 0 0 5.8 1.48h.01C18.66 23.84 24 18.5 24 11.92c0-3.18-1.24-6.17-3.48-8.44ZM12.08 21.8a9.88 9.88 0 0 1-5.04-1.38l-.36-.21-3.72.98.99-3.63-.23-.37a9.86 9.86 0 0 1-1.52-5.26c0-5.46 4.44-9.9 9.9-9.9a9.82 9.82 0 0 1 7 2.9 9.83 9.83 0 0 1 2.9 7c0 5.46-4.44 9.9-9.92 9.9Zm5.43-7.42c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.5 1.69.64.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z"/></svg><span>Contactar pelo WhatsApp</span>

          </a>

        ` : ""}

      </div>

    </article>

  `;



  mostrarAreaPrincipal("detalhes-produto");

  area.hidden = false;

  abrirPagina("detalhes-produto");

  carregarEstadoInteresse(id).catch(() => {});



  $("#voltar-detalhes")?.addEventListener("click", () => {

    area.hidden = true;

    mostrarAreaPrincipal(paginaAnteriorDetalhes);

    abrirPagina("area-produtos");

  });

}



/* =========================================================

   PERFIL PÚBLICO DO VENDEDOR

   ========================================================= */



async function carregarEstadoSeguimento(id) {
 const b=document.querySelector('[data-seguir-vendedor="'+CSS.escape(String(id))+'"]'); if(!b)return;
 try { const d=await pedidoAPI('/api/social/users/'+encodeURIComponent(id)+'/follow'); definirTexto('#seguidores-vendedor-publico',Number(d.followers||0).toLocaleString('pt-AO')); b.hidden=Boolean(d.isSelf); b.dataset.seguindo=String(Boolean(d.following)); b.textContent=d.following?'✓ A seguir':'＋ Seguir'; b.setAttribute('aria-pressed',String(Boolean(d.following))); b.classList.toggle('is-following',Boolean(d.following)); } catch(_){b.hidden=true;}
}
async function alternarSeguimento(b) {
 if(!exigirLogin()){mostrarMensagem('Inicia sessão para seguir vendedores.','aviso');return;}
 const id=b.dataset.seguirVendedor,following=b.dataset.seguindo==='true'; b.disabled=true;
 try { const d=await pedidoAPI('/api/social/users/'+encodeURIComponent(id)+'/follow',{method:following?'DELETE':'POST'}); b.dataset.seguindo=String(Boolean(d.following)); b.textContent=d.following?'✓ A seguir':'＋ Seguir'; b.setAttribute('aria-pressed',String(Boolean(d.following))); b.classList.toggle('is-following',Boolean(d.following)); definirTexto('#seguidores-vendedor-publico',Number(d.followers||0).toLocaleString('pt-AO')); } catch(e){mostrarMensagem(e.message||'Não foi possível atualizar o seguimento.','erro');} finally{b.disabled=false;}
}

async function abrirPerfilPublico(id) {

  if (!id) return;



  paginaAnteriorPerfilPublico = "area-produtos";



  const area = prepararAreaPerfilPublico();

  if (!area) return;
  pedidoAPI(`/api/stores/by-user/${encodeURIComponent(id)}/view`, { method: "POST" }).catch(() => {});



  area.hidden = false;

  area.innerHTML = "<p>A carregar perfil do vendedor...</p>";

  mostrarAreaPrincipal("perfil-publico");



  try {

    const dados = await pedidoAPI(

      `/api/products/seller/${encodeURIComponent(id)}`

    );



    vendedorPublicoAtual =

      dados.vendedor ??

      dados.seller ??

      dados.utilizador ??

      dados.usuario ??

      null;



    const produtos = dados.produtos ?? dados.products ?? [];

    produtosVendedorPublico = produtos;



    const nome =

      vendedorPublicoAtual?.name ??

      vendedorPublicoAtual?.nome ??

      produtos[0]?.seller_name ??

      "Vendedor";



    const avatar =

      vendedorPublicoAtual?.avatar ??

      produtos[0]?.seller_avatar ??

      "";



    area.innerHTML = `

      <button type="button" id="voltar-perfil-publico">← Voltar aos produtos</button>
      <div class="bisno-perfil-capa bisno-perfil-capa-publica" style="${vendedorPublicoAtual?.cover ? 'background-image:url(' + escaparHTML(obterImagem(vendedorPublicoAtual.cover)) + ')' : '' }"><span>Perfil no Bisno</span></div>
      <div class="cabecalho-perfil-publico">
        <img
          class="avatar-perfil-publico"
          src="${escaparHTML(avatar ? obterImagem(avatar) : IMAGEM_PADRAO)}"
          alt="Fotografia de ${escaparHTML(nome)}"
          width="112"
          height="112"
          onerror="this.onerror=null;this.src='${IMAGEM_PADRAO}'"
        >
        <h2 class="nome-perfil-publico">${escaparHTML(nome)}</h2>
        <p class="meta-perfil-publico">${produtos.length} ${produtos.length === 1 ? "anúncio publicado" : "anúncios publicados"} no Bisno</p>
        <div class="bisno-social-stats"><span><strong>${produtos.length.toLocaleString("pt-AO")}</strong> anúncios</span><span><strong id="seguidores-vendedor-publico">…</strong> seguidores</span></div>
        <div class="bisno-perfil-acoes"><button type="button" class="bisno-seguir-btn" data-seguir-vendedor="${escaparHTML(id)}" hidden>＋ Seguir</button></div>
      </div>
      <h3>Anúncios deste vendedor</h3>



      <div class="lista-produtos">

        ${

          produtos.length

            ? produtos.map(cartaoProduto).join("")

            : "<p>Este vendedor ainda não tem anúncios.</p>"

        }

      </div>

    `;



    carregarEstadoSeguimento(id).catch(() => {});
    $("#voltar-perfil-publico")?.addEventListener("click", () => {

      area.hidden = true;

      mostrarAreaPrincipal(paginaAnteriorPerfilPublico);

      abrirPagina("area-produtos");

    });



    produtos.forEach(produto => {

      carregarEstadoInteresse(obterIdProduto(produto)).catch(() => {});

    });

  } catch (erro) {

    area.innerHTML = `

      <button type="button" id="voltar-perfil-publico">← Voltar</button>

      <p>${escaparHTML(erro.message || "Não foi possível carregar o perfil.")}</p>

    `;



    $("#voltar-perfil-publico")?.addEventListener("click", () => {

      area.hidden = true;

      mostrarAreaPrincipal("area-produtos");

    });

  }

}



let produtosVendedorPublico = [];



/* =========================================================

   INTERESSES NOS PRODUTOS

   ========================================================= */



function atualizarBotoesInteresse(id, total, interessado) {
  const quantidade = Math.max(0, numero(total));
  document.querySelectorAll("[data-interesse]").forEach(botao => {
    if (String(botao.dataset.interesse) !== String(id)) return;
    botao.setAttribute("aria-pressed", String(Boolean(interessado)));
    botao.classList.toggle("interesse-ativo", Boolean(interessado));
    const contador = botao.querySelector("[data-total-interesses]");
    if (contador) contador.textContent = String(quantidade);
  });
}

async function carregarEstadoInteresse(id) {

  if (!id) return;



  try {

    const dados = await pedidoAPI(

      `/api/social/products/${encodeURIComponent(id)}/interests`

    );



    atualizarBotoesInteresse(

      id,

      dados.total ?? 0,

      dados.interessado ?? false

    );

  } catch (erro) {

    console.warn("Não foi possível carregar os interesses:", erro.message);

  }

}



async function alternarInteresse(id) {

  if (!exigirLogin()) return;



  const botao = document.querySelector(

    `[data-interesse="${CSS.escape(String(id))}"]`

  );



  const jaTemInteresse = botao?.getAttribute("aria-pressed") === "true";



  if (botao) botao.disabled = true;



  try {

    const dados = await pedidoAPI(

      `/api/social/interests/${encodeURIComponent(id)}`,

      {

        method: jaTemInteresse ? "DELETE" : "POST"

      }

    );



    atualizarBotoesInteresse(

      id,

      dados.total ?? 0,

      dados.interessado ?? !jaTemInteresse

    );



    mostrarMensagem(

      dados.mensagem ||

        (jaTemInteresse

          ? "Retiraste o teu interesse."

          : "Adicionaste o produto aos teus interesses."),

      "sucesso"

    );



    atualizarNotificacoes().catch(() => {});

  } catch (erro) {

    mostrarMensagem(

      erro.message || "Não foi possível atualizar o interesse.",

      "erro"

    );

  } finally {

    if (botao) botao.disabled = false;

  }

}



/* =========================================================

   NOTIFICAÇÕES

   ========================================================= */



function textoNotificacao(notificacao) {

  return notificacao.message ??

    notificacao.mensagem ??

    notificacao.text ??

    notificacao.texto ??

    notificacao.body ??

    "Tens uma nova notificação.";

}



function notificacaoJaLida(notificacao) {

  return Boolean(

    notificacao.read_at ??

    notificacao.lida_em ??

    notificacao.lida ??

    notificacao.is_read

  );

}



async function atualizarNotificacoes() {

  const lista = $("#lista-notificacoes");

  if (!lista || !utilizadorAtual) return;



  lista.innerHTML = "<p>A carregar notificações...</p>";



  try {

    const dados = await pedidoAPI("/api/social/notifications");

    const notificacoes = dados.notificacoes ?? dados.notifications ?? [];

    const naoLidas = dados.naoLidas ?? dados.nao_lidas ??

      notificacoes.filter(n => !notificacaoJaLida(n)).length;



    definirTexto("#contador-notificacoes", String(naoLidas));
    atualizarBadge("#nav-contador-notificacoes", naoLidas);



    if (!notificacoes.length) {

      lista.innerHTML = "<p>Não tens notificações.</p>";

      return;

    }



    lista.innerHTML = notificacoes.map(notificacao => {

      const id = notificacao.id ?? notificacao.notification_id;

      const lida = notificacaoJaLida(notificacao);



      return `

        <article class="item-notificacao ${lida ? "notificacao-lida" : "notificacao-nao-lida"}">

          <p>${escaparHTML(textoNotificacao(notificacao))}</p>

          <small>${escaparHTML(formatarData(

            notificacao.created_at ?? notificacao.data ?? notificacao.createdAt

          ))}</small>



          ${!lida && id != null ? `

            <button type="button" data-marcar-notificacao="${escaparHTML(id)}">

              Marcar como lida

            </button>

          ` : ""}

        </article>

      `;

    }).join("");

  } catch (erro) {

    lista.innerHTML = `<p>${escaparHTML(erro.message || "Não foi possível carregar as notificações.")}</p>`;

  }

}



async function abrirNotificacoesEMarcarLidas() {
  await atualizarNotificacoes();
  const ids = [...document.querySelectorAll("[data-marcar-notificacao]")]
    .map(botao => botao.getAttribute("data-marcar-notificacao"));
  await Promise.allSettled(ids.map(id => pedidoAPI(
    `/api/social/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }
  )));
  await atualizarNotificacoes();
}

async function marcarNotificacaoLida(id) {

  try {

    await pedidoAPI(

      `/api/social/notifications/${encodeURIComponent(id)}/read`,

      { method: "PATCH" }

    );



    await atualizarNotificacoes();

  } catch (erro) {

    mostrarMensagem(erro.message || "Não foi possível marcar a notificação.", "erro");

  }

}



/* =========================================================

   CONVERSAS E CHAT INTERNO

   ========================================================= */



function atualizarBadge(seletor, quantidade) {
  const badge = document.querySelector(seletor);
  if (!badge) return;
  const total = Math.max(0, Number(quantidade) || 0);
  badge.textContent = total > 99 ? "99+" : String(total);
  badge.hidden = total === 0;
}

function obterIdConversa(conversa) {

  return conversa?.id ?? conversa?.conversation_id ?? conversa?.conversa_id;

}



function formatarConversa(conversa) {

  const id = obterIdConversa(conversa);

  const produto = conversa.product_name ?? conversa.produto_nome ?? "Produto";

  const outraPessoa =

    conversa.other_user_name ??

    conversa.otherUserName ??

    conversa.user_name ??

    conversa.nome_utilizador ??

    "Utilizador";

  const ultimaMensagem =

    conversa.last_message ??

    conversa.ultima_mensagem ??

    "Ainda não há mensagens.";



  const naoLidas = numero(

    conversa.unread_count ?? conversa.nao_lidas ?? conversa.naoLidas

  );



  return `
    <article class="item-conversa bisno-item-conversa">
      <div class="avatar-conversa" aria-hidden="true">${escaparHTML(String(outraPessoa).trim().charAt(0).toUpperCase() || "?")}</div>
      <button type="button" class="conversa-resumo" data-abrir-conversa="${escaparHTML(id)}" data-titulo-conversa="${escaparHTML(outraPessoa)}" aria-label="Abrir conversa com ${escaparHTML(outraPessoa)}">
        <span class="conversa-nome">${escaparHTML(outraPessoa)}</span>
        <span class="conversa-produto">Sobre: ${escaparHTML(produto)}</span>
        <span class="conversa-ultima">${escaparHTML(ultimaMensagem)}</span>
      </button>
      <span class="conversa-meta">${naoLidas > 0 ? `<span class="conversa-nao-lidas">${naoLidas}</span>` : ""}</span>
    </article>
  `;

}



async function atualizarConversas() {

  const lista = $("#lista-conversas");

  if (!lista || !utilizadorAtual) return;



  lista.innerHTML = "<p>A carregar conversas...</p>";



  try {

    const dados = await pedidoAPI("/api/social/conversations");

    const conversas = dados.conversas ?? dados.conversations ?? [];
    const totalNaoLidas = conversas.reduce((total, conversa) => total + numero(
      conversa.unread_count ?? conversa.nao_lidas ?? conversa.naoLidas
    ), 0);
    atualizarBadge("#nav-contador-mensagens", totalNaoLidas);



    if (!conversas.length) {

      lista.innerHTML = "<p>Ainda não tens conversas. Podes contactar um vendedor a partir de um produto.</p>";

      return;

    }



    lista.innerHTML = conversas.map(formatarConversa).join("");

  } catch (erro) {

    lista.innerHTML = `<p>${escaparHTML(erro.message || "Não foi possível carregar as conversas.")}</p>`;

  }

}



async function iniciarConversa(idProduto) {

  if (!exigirLogin()) return;



  const produto = todosProdutos.find(

    item => String(obterIdProduto(item)) === String(idProduto)

  );



  if (produto && eProdutoDoUtilizador(produto)) {

    mostrarMensagem("Não podes iniciar uma conversa contigo próprio através deste anúncio.", "aviso");

    return;

  }



  try {

    const dados = await pedidoAPI("/api/social/conversations", {

      method: "POST",

      body: { productId: idProduto }

    });



    const conversa =

      dados.conversa ??

      dados.conversation ??

      dados;



    const idConversa = obterIdConversa(conversa);



    if (!idConversa) {

      await atualizarConversas();

      abrirPagina("area-conta");

      mostrarMensagem("A conversa foi iniciada. Abre a lista de mensagens para a consultar.", "sucesso");

      return;

    }



    await abrirConversa(

      idConversa,

      produto?.name ?? conversa.product_name ?? "Conversa"

    );



    abrirPagina("area-mensagens");

  } catch (erro) {

    mostrarMensagem(erro.message || "Não foi possível iniciar a conversa.", "erro");

  }

}



async function abrirConversa(id, titulo = "Conversa") {

  if (!exigirLogin()) return;



  conversaAtual = String(id);



  const painel = $("#painel-chat");

  if (painel) painel.hidden = false;



  definirTexto("#titulo-conversa", titulo);
  const avatar = document.querySelector("#avatar-chat");
  if (avatar) avatar.textContent = String(titulo || "?").trim().charAt(0).toUpperCase() || "?";
  definirTexto("#estado-chat", "Conversa no Bisno");



  await carregarMensagens();
  await atualizarConversas();



  if (intervaloChat) clearInterval(intervaloChat);



  intervaloChat = setInterval(() => {

    if (conversaAtual) {

      carregarMensagens(true).catch(console.error);

    }

  }, 4000);

}



function fecharChat() {

  conversaAtual = null;



  if (intervaloChat) {

    clearInterval(intervaloChat);

    intervaloChat = null;

  }



  const painel = $("#painel-chat");

  if (painel) painel.hidden = true;



  const lista = $("#lista-mensagens");

  if (lista) lista.innerHTML = "<p>Seleciona uma conversa para começar.</p>";

}



function mensagemFoiEnviadaPeloUtilizador(mensagem) {

  const idAtual = obterIdUtilizador();

  const idRemetente =

    mensagem.sender_id ??

    mensagem.user_id ??

    mensagem.author_id ??

    mensagem.remetente_id;



  if (idAtual != null && idRemetente != null) {

    return String(idAtual) === String(idRemetente);

  }



  return (

    mensagem.sender_name ??

    mensagem.user_name ??

    mensagem.nome_utilizador ??

    ""

  ) === nomeUtilizadorAtual();

}



async function carregarMensagens(silencioso = false) {

  if (!conversaAtual || !utilizadorAtual) return;



  const lista = $("#lista-mensagens");

  if (!lista) return;



  if (!silencioso) {

    lista.innerHTML = "<p>A carregar mensagens...</p>";

  }



  try {

    const dados = await pedidoAPI(

      `/api/social/conversations/${encodeURIComponent(conversaAtual)}/messages`

    );



    const mensagens = dados.mensagens ?? dados.messages ?? [];



    if (!mensagens.length) {

      lista.innerHTML = "<p>Esta conversa ainda não tem mensagens. Envia a primeira!</p>";

      return;

    }



    const estavaNoFim =

      lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80;



    lista.innerHTML = mensagens.map(mensagem => {

      const minha = mensagemFoiEnviadaPeloUtilizador(mensagem);



      return `

        <article class="mensagem-chat ${minha ? "mensagem-minha" : "mensagem-outra"}">

          <strong>${escaparHTML(

            minha

              ? "Tu"

              : mensagem.sender_name ??

                mensagem.user_name ??

                mensagem.nome_utilizador ??

                "Utilizador"

          )}</strong>



          <p>${escaparHTML(

            mensagem.body ??

            mensagem.message ??

            mensagem.conteudo ??

            mensagem.texto ??

            ""

          )}</p>



          <small>${escaparHTML(formatarData(

            mensagem.created_at ??

            mensagem.data ??

            mensagem.createdAt

          ))}</small>

        </article>

      `;

    }).join("");



    if (estavaNoFim || !silencioso) {

      lista.scrollTop = lista.scrollHeight;

    }

  } catch (erro) {

    if (!silencioso) {

      lista.innerHTML = `<p>${escaparHTML(erro.message || "Não foi possível carregar as mensagens.")}</p>`;

    }

  }

}



async function enviarMensagem(evento) {

  evento.preventDefault();



  if (!exigirLogin()) return;



  if (!conversaAtual) {

    mostrarMensagem("Abre uma conversa antes de enviares uma mensagem.", "aviso");

    return;

  }



  const campo = $("#texto-mensagem");

  const texto = campo?.value.trim() ?? "";



  if (!texto) {

    mostrarMensagem("Escreve uma mensagem antes de enviar.", "aviso");

    return;

  }



  if (texto.length > 3000) {

    mostrarMensagem("A mensagem não pode ultrapassar 3000 caracteres.", "erro");

    return;

  }



  const botao = $('#form-enviar-mensagem button[type="submit"]');

  if (botao) botao.disabled = true;



  try {

    await pedidoAPI(

      `/api/social/conversations/${encodeURIComponent(conversaAtual)}/messages`,

      {

        method: "POST",

        body: { body: texto }

      }

    );



    if (campo) campo.value = "";



    await carregarMensagens();

    await atualizarConversas();

    await atualizarNotificacoes();

  } catch (erro) {

    mostrarMensagem(erro.message || "Não foi possível enviar a mensagem.", "erro");

  } finally {

    if (botao) botao.disabled = false;

  }

}



/* =========================================================

   ATUALIZAÇÃO DAS ÁREAS SOCIAIS

   ========================================================= */



let totalMensagensNaoLidasAnterior = null;
let ultimaNotificacaoMensagem = 0;

function mostrarAvisoMensagemNova(nome = "Alguém") {
  document.getElementById("bisno-aviso-mensagem-nova")?.remove();
  const aviso = document.createElement("button");
  aviso.type = "button";
  aviso.id = "bisno-aviso-mensagem-nova";
  aviso.className = "bisno-aviso-mensagem-nova";
  aviso.innerHTML = `<span class="aviso-ponto"></span><span><strong>Nova mensagem</strong><small>${escaparHTML(nome)} acabou de te enviar uma mensagem.</small></span><span aria-hidden="true">×</span>`;
  aviso.addEventListener("click", () => { aviso.remove(); abrirPagina("area-mensagens"); atualizarConversas(); });
  document.body.appendChild(aviso);
  window.setTimeout(() => aviso.remove(), 9000);
}

async function verificarMensagensNovas() {
  if (!utilizadorAtual || document.hidden) return;
  try {
    const dados = await pedidoAPI("/api/social/conversations");
    const conversas = dados.conversas ?? dados.conversations ?? [];
    const total = conversas.reduce((n, c) => n + numero(c.unread_count ?? c.nao_lidas ?? c.naoLidas), 0);
    atualizarBadge("#badge-mensagens", total);
    if (totalMensagensNaoLidasAnterior !== null && total > totalMensagensNaoLidasAnterior && Date.now() - ultimaNotificacaoMensagem > 2500) {
      const conversa = conversas.find(c => numero(c.unread_count ?? c.nao_lidas ?? c.naoLidas) > 0);
      mostrarAvisoMensagemNova(conversa?.other_user_name || conversa?.nome_utilizador || "Alguém");
      ultimaNotificacaoMensagem = Date.now();
    }
    totalMensagensNaoLidasAnterior = total;
  } catch (_) { /* tentará novamente no próximo ciclo */ }
}

function atualizarCapaPerfilProprio() {
  const capa = document.querySelector("#perfil-vendedor .bisno-perfil-capa");
  if (!capa) return;
  const cover = utilizadorAtual?.cover;
  capa.style.backgroundImage = cover ? 'linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.3)),url("' + obterImagem(cover).replace(/"/g,"%22") + '")' : "linear-gradient(135deg,#dce7df,#a9c8b6)";
  capa.classList.toggle("tem-capa", Boolean(cover));
}

function atualizarAreasSociais() {
  if (!utilizadorAtual) return;
  atualizarCapaPerfilProprio();
  atualizarNotificacoes().catch(console.error);
  atualizarConversas().catch(console.error);
  verificarMensagensNovas().catch(console.error);
}



/* =========================================================

   EVENTOS

   ========================================================= */



function configurarEventosProdutos() {
  document.addEventListener("keydown", evento => {
    if (evento.key !== "Enter" && evento.key !== " ") return;
    const imagem = evento.target.closest('.imagem-produto[role="button"]');
    if (!imagem) return;
    evento.preventDefault();
    const cartao = imagem.closest("[data-produto-id]");
    if (cartao) abrirDetalhes(cartao.dataset.produtoId);
  });


  document.addEventListener("click", evento => {
    const seguir = evento.target.closest("[data-seguir-vendedor]");
    if (seguir) {
      evento.preventDefault();
      evento.stopPropagation();
      alternarSeguimento(seguir);
      return;
    }

    const imagem = evento.target.closest(".imagem-produto");
    if (imagem) {
      const cartao = imagem.closest("[data-produto-id]");
      if (cartao) abrirDetalhes(cartao.dataset.produtoId);
      return;
    }


    const detalhes = evento.target.closest("[data-ver-detalhes]");

    if (detalhes) {

      abrirDetalhes(detalhes.dataset.verDetalhes);

      return;

    }



    const interesse = evento.target.closest("[data-interesse]");

    if (interesse) {

      alternarInteresse(interesse.dataset.interesse);

      return;

    }



    const vendedor = evento.target.closest("[data-ver-vendedor]");

    if (vendedor) {

      abrirPerfilPublico(vendedor.dataset.verVendedor);

      return;

    }



    const iniciar = evento.target.closest("[data-iniciar-conversa]");

    if (iniciar) {

      iniciarConversa(iniciar.dataset.iniciarConversa);

      return;

    }



    const apagar = evento.target.closest("[data-apagar-anuncio]");

    if (apagar) {

      apagarAnuncio(apagar.dataset.apagarAnuncio);

      return;

    }



    const abrir = evento.target.closest("[data-abrir-conversa]");

    if (abrir) {

      abrirConversa(

        abrir.dataset.abrirConversa,

        abrir.dataset.tituloConversa || "Conversa"

      );

      return;

    }



    const marcar = evento.target.closest("[data-marcar-notificacao]");

    if (marcar) {

      marcarNotificacaoLida(marcar.dataset.marcarNotificacao);

    }

  });

}



function configurarPainelPesquisa() {
  const overlay = $("#painel-pesquisa-overlay");
  const abrir = $("#botao-abrir-pesquisa");
  const fechar = $("#botao-fechar-pesquisa");
  const campo = $("#filtro-pesquisa");
  if (!overlay || !abrir || abrir.dataset.configurado === "true") return;
  abrir.dataset.configurado = "true";
  function mostrar() {
    overlay.hidden = false;
    abrir.setAttribute("aria-expanded", "true");
    window.setTimeout(() => campo?.focus(), 40);
  }
  function ocultar() {
    overlay.hidden = true;
    abrir.setAttribute("aria-expanded", "false");
    abrir.focus();
  }
  abrir.addEventListener("click", () => overlay.hidden ? mostrar() : ocultar());
  fechar?.addEventListener("click", ocultar);
  document.addEventListener("keydown", evento => {
    if (evento.key === "Escape" && !overlay.hidden) ocultar();
  });
  document.addEventListener("click", evento => {
    // Evita que o mesmo clique na lupa abra e feche o painel imediatamente.
    if (abrir.contains(evento.target)) return;
    if (!overlay.hidden && !overlay.contains(evento.target)) {
      overlay.hidden = true;
      abrir.setAttribute("aria-expanded", "false");
    }
  });
}

function configurarFiltros() {

  const limparFiltros = () => {
    ["#filtro-pesquisa", "#filtro-categoria", "#filtro-cidade", "#ordenar-produtos", "#filtro-preco"]
      .forEach(seletor => {
        const campo = $(seletor);
        if (campo) campo.value = "";
      });
    aplicarFiltros();
    $("#filtro-pesquisa")?.focus();
  };

  document.querySelectorAll("[data-categoria-rapida]").forEach(botao => {
    botao.addEventListener("click", () => {
      const campoCategoria = $("#filtro-categoria");
      if (!campoCategoria) return;
      campoCategoria.value = botao.dataset.categoriaRapida || "";
      aplicarFiltros();
      $("#painel-pesquisa")?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.querySelectorAll("[data-categoria-rapida]").forEach(item => {
        item.setAttribute("aria-pressed", String(item === botao));
      });
    });
  });

  $("#limpar-filtros")?.addEventListener("click", limparFiltros);
  $("#lista-produtos")?.addEventListener("click", evento => {
    if (evento.target.closest("[data-limpar-filtros]")) limparFiltros();
  });

  [

    "#filtro-pesquisa",

    "#filtro-categoria",

    "#filtro-cidade",

    "#ordenar-produtos",

    "#filtro-preco"

  ].forEach(seletor => {

    const elemento = $(seletor);

    if (!elemento) return;



    elemento.addEventListener(

      elemento.tagName === "INPUT" && elemento.type === "search"

        ? "input"

        : "change",

      aplicarFiltros

    );



    if (elemento.id === "filtro-cidade" || elemento.id === "filtro-preco") {

      elemento.addEventListener("input", aplicarFiltros);

    }

  });

}



function configurarFormularios() {
  $("#form-anuncio")?.addEventListener("submit", publicarAnuncio);
  configurarPrevisualizacaoAnuncio();

  $("#form-login")?.addEventListener("submit", entrarUtilizador);

  $("#form-registo")?.addEventListener("submit", registarUtilizador);
  $("#botao-recuperar-password")?.addEventListener("click", () => { if ($("#recuperar-email") && $("#login-email")) $("#recuperar-email").value = $("#login-email").value; mostrarAba("recuperar"); });
  $("#botao-cancelar-recuperacao")?.addEventListener("click", () => mostrarAba("login"));
  $("#botao-voltar-login")?.addEventListener("click", () => mostrarAba("login"));
  $("#form-recuperar-password")?.addEventListener("submit", async evento => {
    evento.preventDefault();
    try { const r = await pedidoAPI("/api/auth/forgot-password", { method: "POST", body: { email: $("#recuperar-email")?.value || "" } }); mostrarAba("login"); mostrarMensagem(r.mensagem, "sucesso"); }
    catch (e) { mostrarMensagem(e.message || "Não foi possível pedir a recuperação.", "erro"); }
  });

  $("#perfil-foto-input")?.addEventListener("change", evento => {
    const ficheiro = evento.currentTarget.files?.[0];
    if (!ficheiro) return;
    if (ficheiro.size > LIMITE_IMAGEM) {
      mostrarMensagem("A fotografia do perfil não pode ultrapassar 5 MB.", "erro");
      evento.currentTarget.value = "";
      return;
    }
    const foto = $("#foto-perfil"), fallback = $("#perfil-sem-foto");
    if (foto) { foto.src = URL.createObjectURL(ficheiro); foto.hidden = false; }
    if (fallback) fallback.hidden = true;
  });
  $("#perfil-capa-clicavel")?.addEventListener("click", () => $("#perfil-capa-input")?.click());
  $("#perfil-avatar-clicavel")?.addEventListener("click", () => $("#perfil-foto-input")?.click());
  $("#perfil-capa-input")?.addEventListener("change", evento => {
    const file = evento.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > LIMITE_IMAGEM) { mostrarMensagem("A foto de capa não pode ultrapassar 5 MB.", "erro"); evento.currentTarget.value = ""; return; }
    const url = URL.createObjectURL(file);
    const capa = $("#perfil-capa-clicavel");
    if (capa) capa.style.backgroundImage = 'url("' + url + '")';
  });
  $("#perfil-foto-input")?.addEventListener("change", evento => {
    const file = evento.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > LIMITE_IMAGEM) { mostrarMensagem("A fotografia do perfil não pode ultrapassar 5 MB.", "erro"); evento.currentTarget.value = ""; return; }
    const foto = $("#foto-perfil"), fallback = $("#perfil-sem-foto");
    if (foto) { foto.src = URL.createObjectURL(file); foto.hidden = false; }
    if (fallback) fallback.hidden = true;
  });

  $("#acao-editar-dados-perfil")?.addEventListener("click", () => { const f = $("#form-perfil"); if (f) f.hidden = !f.hidden; });
  $("#form-perfil")?.addEventListener("submit", guardarPerfil);


  $("#form-enviar-mensagem")?.addEventListener("submit", enviarMensagem);



  $("#atalho-meus-anuncios")?.addEventListener("click", () => {
    if (utilizadorAtual) {
      abrirPagina("area-meus-anuncios");
      carregarMeusAnuncios();
    } else {
      mostrarAba("login");
      abrirPagina("area-autenticacao");
    }
  });

  $("#botao-sair")?.addEventListener("click", terminarSessao);



  $("#botao-atualizar-anuncios")?.addEventListener("click", () => {

    carregarMeusAnuncios();

  });



  $("#botao-atualizar-notificacoes")?.addEventListener("click", () => {

    atualizarNotificacoes();

  });



  $("#botao-atualizar-conversas")?.addEventListener("click", () => {

    atualizarConversas();

  });



  $("#botao-fechar-chat")?.addEventListener("click", fecharChat);
  $("#botao-voltar-conversas")?.addEventListener("click", fecharChat);

}




/* Loja: painel interativo ligado à API persistente */
async function pedidoLoja(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.erro || "Não foi possível carregar a loja.");
  return data;
}
function mostrarEstatisticasLoja(stats = {}) {
  definirTexto("#loja-visitas", numero(stats.views).toLocaleString("pt-AO"));
  definirTexto("#loja-seguidores", numero(stats.followers).toLocaleString("pt-AO"));
  definirTexto("#loja-contactos", numero(stats.contacts).toLocaleString("pt-AO"));
  definirTexto("#loja-produtos", numero(stats.products).toLocaleString("pt-AO"));
}
function preencherPainelLoja(data = {}) {
  const store = data.store, form = $("#form-loja"), preview = $("#previsualizacao-loja"), status = $("#estado-loja");
  mostrarEstatisticasLoja(data.stats || {});
  if (!store) {
    if (status) { status.textContent = "Ainda não ativada"; status.classList.remove("ativa"); }
    if ($("#titulo-form-loja")) $("#titulo-form-loja").textContent = "Ativa a tua loja gratuitamente";
    if ($("#botao-guardar-loja")) $("#botao-guardar-loja").textContent = "Ativar a minha loja";
    if (preview) preview.hidden = true;
    if (form) form.hidden = false;
    if (form) { form.elements.name.value = ""; form.elements.description.value = ""; form.elements.city.value = ""; if (form.elements.brand_image) form.elements.brand_image.value = ""; }
    return;
  }
  if (status) { status.textContent = "Loja ativa"; status.classList.add("ativa"); }
  if ($("#titulo-form-loja")) $("#titulo-form-loja").textContent = "Personaliza a tua loja";
  if ($("#botao-guardar-loja")) $("#botao-guardar-loja").textContent = "Guardar alterações";
  if (form) { form.elements.name.value = store.name || ""; form.elements.description.value = store.description || ""; form.elements.city.value = store.city || ""; if (form.elements.brand_image) form.elements.brand_image.value = store.brand_image || ""; }
  if (preview) preview.hidden = false;
  if (form) form.hidden = true;
  definirTexto("#loja-nome-preview", store.name || "A tua loja");
  definirTexto("#loja-descricao-preview", store.description || "Adiciona uma descrição para apresentar a tua loja.");
  definirTexto("#loja-cidade-preview", store.city || "Angola");
  const capaLoja = $("#loja-capa-preview");
  if (capaLoja) capaLoja.style.backgroundImage = store.cover ? 'url("' + obterImagem(store.cover).replace(/"/g, "%22") + '")' : "";
  const marca = $("#loja-avatar");
  if (marca) marca.innerHTML = store.brand_image && /^https:\/\//i.test(store.brand_image) ? '<img src="' + escaparHTML(store.brand_image) + '" alt="Logótipo de ' + escaparHTML(store.name || "loja") + '" loading="lazy" style="width:100%;height:100%;object-fit:contain;border-radius:inherit">': escaparHTML((store.name || "B").trim().charAt(0).toUpperCase());
}
async function carregarMinhaLoja() {
  try {
    const data = await pedidoLoja("/api/stores/mine");
    preencherPainelLoja(data);
    // A montra do vendedor também apresenta os anúncios publicados pela própria conta.
    const lista = document.getElementById("lista-anuncios-minha-loja");
    if (lista) {
      lista.setAttribute("aria-busy", "true");
      try {
        const meus = await pedidoAPI("/api/products/mine");
        const produtos = meus.produtos ?? meus.products ?? meus.anuncios ?? [];
        lista.innerHTML = produtos.length
          ? produtos.map(cartaoProduto).join("")
          : "<p>Ainda não tens anúncios publicados. Publica um produto e ele aparecerá aqui.</p>";
      } catch (erroLista) {
        lista.innerHTML = "<p>" + escaparHTML(erroLista.message || "Não foi possível carregar os anúncios da loja.") + "</p>";
      } finally { lista.setAttribute("aria-busy", "false"); }
    }
  } catch (erro) { mostrarMensagem(erro.message || "Erro ao carregar a loja.", "erro"); }
}
function configurarLoja() {
  $("#form-loja")?.addEventListener("submit", async evento => {
    evento.preventDefault();
    const form = evento.currentTarget, existente = $("#estado-loja")?.classList.contains("ativa");
    const payload = { name: form.elements.name.value.trim(), description: form.elements.description.value.trim(), city: form.elements.city.value.trim() };
    const botao = $("#botao-guardar-loja");
    if (botao) { botao.disabled = true; botao.textContent = "A guardar…"; }
    try {
      const data = await pedidoLoja(existente ? "/api/stores/mine" : "/api/stores/activate", { method: existente ? "PATCH" : "POST", body: JSON.stringify(payload) });
      preencherPainelLoja(data);
      const logoFile = $("#loja-imagem-marca")?.files?.[0], coverFile = $("#loja-imagem-capa")?.files?.[0];
      if (logoFile || coverFile) {
        if ([logoFile, coverFile].filter(Boolean).some(file => file.size > LIMITE_IMAGEM)) throw new Error("Cada imagem deve ter no máximo 5 MB.");
        const images = new FormData(); if (logoFile) images.append("logo", logoFile); if (coverFile) images.append("cover", coverFile);
        const updated = await pedidoAPI("/api/stores/media", { method: "POST", body: images });
        preencherPainelLoja(updated);
      }
      mostrarMensagem(existente ? "A tua loja foi atualizada." : "A tua loja foi ativada com sucesso.", "sucesso");
    } catch (erro) { mostrarMensagem(erro.message || "Não foi possível guardar a loja.", "erro"); }
    finally { if (botao) { botao.disabled = false; botao.textContent = existente ? "Guardar alterações" : "Ativar a minha loja"; } }
  });
  $("#acao-editar-loja")?.addEventListener("click", () => { const form=$("#form-loja"); if(form){form.hidden=!form.hidden; if(!form.hidden) form.scrollIntoView({behavior:"smooth",block:"nearest"});} });
  const logoInput=$("#loja-imagem-marca"), coverInput=$("#loja-imagem-capa");
  $("#loja-avatar")?.addEventListener("click",()=>logoInput?.click());
  $("#loja-avatar")?.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();logoInput?.click();}});
  $("#loja-capa-preview")?.addEventListener("click",()=>coverInput?.click());
  $("#loja-capa-preview")?.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();coverInput?.click();}});
  [logoInput,coverInput].forEach(input=>input?.addEventListener("change",()=>{if(input.files?.length){const form=$("#form-loja");if(form){form.hidden=false;form.requestSubmit();}}}));
  $("#botao-atualizar-loja")?.addEventListener("click", carregarMinhaLoja);
}




let paginaDiretorioLojas = 1;
let detalheLojaAtual = null;
async function carregarCategoriasLojas() {
 const select=$("#filtro-categoria-lojas");
 if(!select||select.dataset.carregado==="true")return;
 try{const data=await pedidoLoja("/api/stores/categories");const atual=select.value;select.innerHTML='<option value="">Todas as categorias</option>'+(data.categories||[]).map(c=>'<option value="'+escaparHTML(c.name)+'">'+escaparHTML(c.name)+' ('+numero(c.products)+')</option>').join("");select.value=atual;select.dataset.carregado="true";}catch(_){}
}
async function carregarDiretorioLojas(page=1) {
 const list=$("#lista-diretorio-lojas"),count=$("#contagem-lojas"),pager=$("#paginacao-lojas"),detail=$("#detalhe-diretorio-loja");
 if(!list||!count)return;
 paginaDiretorioLojas=Math.max(1,page);if(detail){detail.hidden=true;detail.innerHTML="";}list.hidden=false;list.innerHTML="<p>A carregar lojas…</p>";count.textContent="A procurar lojas…";
 await carregarCategoriasLojas();
 const params=new URLSearchParams({q:$("#pesquisa-lojas")?.value.trim()||"",city:$("#filtro-cidade-lojas")?.value.trim()||"",category:$("#filtro-categoria-lojas")?.value||"",sort:$("#ordenar-lojas")?.value||"recent",page:String(paginaDiretorioLojas),limit:"12"});
 try{
  const data=await pedidoLoja("/api/stores/directory?"+params.toString()),stores=data.stores||[];
  count.textContent=data.total?data.total+(data.total===1?" loja encontrada":" lojas encontradas"):"Ainda não existem lojas que correspondam à pesquisa.";
  list.innerHTML=stores.length?stores.map(store=>{
   const initial=(store.name||"B").trim().charAt(0).toUpperCase();
   const avatar=store.brand_image?'<img src="'+escaparHTML(store.brand_image)+'" alt="Logótipo de '+escaparHTML(store.name)+'" loading="lazy">':store.avatar?'<img src="'+escaparHTML(obterImagem(store.avatar))+'" alt="" loading="lazy">':'<span aria-hidden="true">'+escaparHTML(initial)+'</span>';
   const cover=store.cover?'<img class="bisno-directory-cover" src="'+escaparHTML(obterImagem(store.cover))+'" alt="" loading="lazy">':'<div class="bisno-directory-cover bisno-directory-cover-empty" aria-hidden="true"></div>';
   return '<article class="bisno-directory-card">'+cover+'<div class="bisno-directory-card-body"><div class="bisno-directory-avatar">'+avatar+'</div><h2>'+escaparHTML(store.name)+'</h2><p class="bisno-directory-location">⌖ '+escaparHTML(store.city||"Angola")+'</p><p class="bisno-directory-description">'+escaparHTML(store.description||"Descobre os produtos desta loja.")+'</p><div class="bisno-directory-meta"><span>'+numero(store.product_count).toLocaleString("pt-AO")+' produtos</span><span>'+numero(store.followers).toLocaleString("pt-AO")+' seguidores</span></div><button type="button" data-visitar-loja="'+escaparHTML(store.id)+'">Visitar loja →</button></div></article>';
  }).join(""):'<div class="bisno-directory-empty"><strong>Nenhuma loja encontrada</strong><p>Experimenta alterar a pesquisa ou limpar os filtros.</p></div>';
  if(pager){pager.hidden=Number(data.pages||0)<=1;$("#lojas-pagina-info").textContent="Página "+(data.page||1)+" de "+(data.pages||1);$("#lojas-pagina-anterior").disabled=Number(data.page||1)<=1;$("#lojas-pagina-seguinte").disabled=Number(data.page||1)>=Number(data.pages||1);}
 }catch(error){list.innerHTML='<p class="bisno-directory-error">'+escaparHTML(error.message||"Não foi possível carregar as lojas.")+'</p>';count.textContent="Erro ao carregar o diretório.";if(pager)pager.hidden=true;}
}
async function abrirDetalheLoja(id) {
 const list=$("#lista-diretorio-lojas"),detail=$("#detalhe-diretorio-loja");if(!detail)return;detail.hidden=false;detail.innerHTML="<p>A carregar a loja…</p>";if(list)list.hidden=true;if($("#paginacao-lojas"))$("#paginacao-lojas").hidden=true;
 try{
  const data=await pedidoLoja("/api/stores/"+encodeURIComponent(id)),store=data.store;if(!store)throw new Error("Loja não encontrada.");detalheLojaAtual=store;
  const products=data.products||[],avatar=store.brand_image?'<img src="'+escaparHTML(store.brand_image)+'" alt="Logótipo de '+escaparHTML(store.name)+'">':store.avatar?'<img src="'+escaparHTML(obterImagem(store.avatar))+'" alt="">':'<span aria-hidden="true">'+escaparHTML((store.name||"B").charAt(0).toUpperCase())+'</span>';
  detail.innerHTML='<button type="button" class="botao-secundario" id="voltar-diretorio-lojas">← Voltar às lojas</button><div class="bisno-store-profile-hero">'+(store.cover?'<img class="bisno-store-profile-cover" src="'+escaparHTML(obterImagem(store.cover))+'" alt="" loading="lazy">':'<div class="bisno-store-profile-cover bisno-directory-cover-empty"></div>')+'<div class="bisno-store-profile-heading"><div class="bisno-directory-avatar bisno-directory-avatar-large">'+avatar+'</div><div><span class="bisno-secao-kicker">Loja no Bisno</span><h2>'+escaparHTML(store.name)+'</h2><p>'+escaparHTML(store.description||"Bem-vindo à nossa loja.")+'</p><small>⌖ '+escaparHTML(store.city||"Angola")+' · Desde '+escaparHTML(String(store.created_at||"").slice(0,10)||"—")+'</small></div></div></div><div class="bisno-store-profile-actions"><button type="button" id="seguir-diretorio-loja" aria-pressed="'+String(Boolean(data.followed))+'">'+(data.followed?"✓ A seguir":"＋ Seguir loja")+'</button><button type="button" id="partilhar-diretorio-loja" class="botao-secundario">↗ Partilhar loja</button><span id="seguidores-diretorio-loja">'+numero(data.stats?.followers).toLocaleString("pt-AO")+' seguidores</span></div><div class="bisno-store-products-heading"><h3>Produtos desta loja</h3><span>'+products.length+' produtos apresentados</span></div><div class="bisno-directory-products">'+(products.length?products.map(p=>'<article class="bisno-directory-product">'+(p.image?'<img src="'+escaparHTML(obterImagem(p.image))+'" alt="" loading="lazy">':'<div class="bisno-directory-product-placeholder">Bisno</div>')+'<div><h4>'+escaparHTML(p.name)+'</h4><strong>'+formatarPreco(p.price)+'</strong><p>'+escaparHTML(p.category||"Sem categoria")+' · '+escaparHTML(p.condition||"")+'</p><p>'+escaparHTML(p.city||store.city||"Angola")+'</p>'+(p.whatsapp?'<a class="bisno-directory-contact" href="https://wa.me/'+escaparHTML(String(p.whatsapp).replace(/\D/g,""))+'" target="_blank" rel="noopener noreferrer" data-store-contact="'+escaparHTML(p.id)+'">Contactar vendedor</a>':'')+'</div></article>').join(""):'<p class="bisno-directory-empty">Esta loja ainda não tem produtos disponíveis.</p>')+'</div>';
 }catch(error){detail.innerHTML='<button type="button" class="botao-secundario" id="voltar-diretorio-lojas">← Voltar às lojas</button><p class="bisno-directory-error">'+escaparHTML(error.message||"Não foi possível abrir esta loja.")+'</p>';}
}
function configurarDiretorioLojas(){
 const painelPesquisa=$("#painel-pesquisa-lojas");
 const botaoPesquisa=$("#botao-abrir-pesquisa-lojas");
 const fecharPesquisa=()=>{if(painelPesquisa)painelPesquisa.hidden=true;if(botaoPesquisa)botaoPesquisa.setAttribute("aria-expanded","false");};
 botaoPesquisa?.addEventListener("click",()=>{const abrir=!!painelPesquisa?.hidden;if(painelPesquisa)painelPesquisa.hidden=!abrir;botaoPesquisa.setAttribute("aria-expanded",String(abrir));if(abrir)$("#pesquisa-lojas")?.focus();});
 $("#botao-fechar-pesquisa-lojas")?.addEventListener("click",fecharPesquisa);
 $("#form-pesquisa-lojas")?.addEventListener("submit",event=>{event.preventDefault();carregarDiretorioLojas(1);fecharPesquisa();});
 $("#limpar-pesquisa-lojas")?.addEventListener("click",()=>{$("#pesquisa-lojas").value="";$("#filtro-cidade-lojas").value="";$("#filtro-categoria-lojas").value="";$("#ordenar-lojas").value="recent";carregarDiretorioLojas(1);});
 $("#lojas-pagina-anterior")?.addEventListener("click",()=>carregarDiretorioLojas(paginaDiretorioLojas-1));
 $("#lojas-pagina-seguinte")?.addEventListener("click",()=>carregarDiretorioLojas(paginaDiretorioLojas+1));
 $("#lista-diretorio-lojas")?.addEventListener("click",event=>{const b=event.target.closest("[data-visitar-loja]");if(b)abrirDetalheLoja(b.dataset.visitarLoja);});
 $("#detalhe-diretorio-loja")?.addEventListener("click",async event=>{
  if(event.target.closest("#voltar-diretorio-lojas")){detalheLojaAtual=null;carregarDiretorioLojas(paginaDiretorioLojas);return;}
  if(event.target.closest("#partilhar-diretorio-loja")&&detalheLojaAtual){const url=window.location.origin+"/?loja="+encodeURIComponent(detalheLojaAtual.id);try{if(navigator.share)await navigator.share({title:detalheLojaAtual.name,text:"Visita esta loja no Bisno",url});else{await navigator.clipboard.writeText(url);mostrarMensagem("Ligação da loja copiada.","sucesso");}}catch(error){if(error.name!=="AbortError")mostrarMensagem("Não foi possível partilhar a loja.","erro");}return;}
  if(event.target.closest("#seguir-diretorio-loja")&&detalheLojaAtual){const b=$("#seguir-diretorio-loja");b.disabled=true;try{const data=await pedidoLoja("/api/stores/"+encodeURIComponent(detalheLojaAtual.id)+"/follow",{method:"POST"});b.textContent=data.followed?"✓ A seguir":"＋ Seguir loja";b.setAttribute("aria-pressed",String(Boolean(data.followed)));$("#seguidores-diretorio-loja").textContent=numero(data.followers).toLocaleString("pt-AO")+" seguidores";}catch(error){mostrarMensagem(error.message||"Não foi possível seguir a loja.","erro");}finally{b.disabled=false;}return;}
  const contact=event.target.closest("[data-store-contact]");if(contact&&detalheLojaAtual)pedidoLoja("/api/stores/"+encodeURIComponent(detalheLojaAtual.id)+"/contact",{method:"POST",body:JSON.stringify({channel:"whatsapp",productId:contact.dataset.storeContact})}).catch(()=>{});
 });
}

async function carregarPainelAdmin() {
  const statsEl = $("#admin-estatisticas"), usersEl = $("#admin-utilizadores"), productsEl = $("#admin-anuncios"), recoveriesEl = $("#admin-recuperacoes"), storesEl = $("#admin-lojas");
  if (!statsEl || !usersEl || !productsEl) return;
  statsEl.textContent = "A carregar estatísticas…";
  try {
    const data = await pedidoAPI("/api/admin/overview");
    const st = data.stats || {};
    statsEl.innerHTML = [
      ["Utilizadores", st.users], ["Contas bloqueadas", st.blockedUsers],
      ["Anúncios", st.products], ["Anúncios ativos", st.activeProducts], ["Anúncios bloqueados", st.blockedProducts]
    ].map(([label, value]) => '<article><span>' + escaparHTML(label) + '</span><strong>' + numero(value) + '</strong></article>').join("");
    usersEl.innerHTML = (data.users || []).map(u => '<article class="admin-item admin-item-compact"><div><strong>' + escaparHTML(u.name) + '</strong><div class="admin-metadados"><span title="E-mail">✉ ' + escaparHTML(u.email) + '</span><span title="Telefone">☎ ' + escaparHTML(u.phone || "—") + '</span><span title="Identificador">🆔 ' + u.id + '</span><span class="admin-estado ' + (u.is_blocked ? 'is-bloqueado' : 'is-ativo') + '">' + (u.is_blocked ? '⛔ Bloqueado' : '● Ativo') + '</span></div></div><div class="admin-acoes admin-acoes-compact"><button type="button" title="' + (u.is_blocked ? 'Desbloquear' : 'Bloquear') + '" aria-label="' + (u.is_blocked ? 'Desbloquear' : 'Bloquear') + '" data-admin-user-block="' + u.id + '" data-blocked="' + (u.is_blocked ? 'false' : 'true') + '">' + (u.is_blocked ? '🔓' : '🔒') + '</button><button type="button" title="Eliminar utilizador" aria-label="Eliminar utilizador" data-admin-user-delete="' + u.id + '">🗑️</button></div></article>').join("") || "<p>Sem utilizadores.</p>";
    productsEl.innerHTML = (data.products || []).map(p => '<article class="admin-item"><div><strong>' + escaparHTML(p.name) + '</strong><p>ID ' + p.id + ' · ' + escaparHTML(p.seller_name || p.seller_email || 'Vendedor') + ' · ' + escaparHTML(p.city || '') + ' · ' + (p.is_blocked ? 'Bloqueado' : 'Ativo') + '</p></div><div class="admin-acoes"><button type="button" data-admin-product-block="' + p.id + '" data-blocked="' + (p.is_blocked ? 'false' : 'true') + '">' + (p.is_blocked ? 'Desbloquear' : 'Bloquear') + '</button><button type="button" data-admin-product-delete="' + p.id + '">Eliminar</button></div></article>').join("") || "<p>Sem anúncios.</p>";
    if (storesEl) {
      try {
        const storeData = await pedidoAPI("/api/admin/stores");
        storesEl.innerHTML = (storeData.stores || []).map(store => {
          const active = Boolean(Number(store.is_active));
          return '<article class="admin-item admin-item-compact"><div><strong>' + escaparHTML(store.name) + '</strong><div class="admin-metadados"><span title="Proprietário">👤 ' + escaparHTML(store.owner_name || "Utilizador") + '</span><span title="Localização">📍 ' + escaparHTML(store.city || "Angola") + '</span><span title="Produtos">📦 ' + numero(store.product_count) + '</span><span title="Seguidores">👥 ' + numero(store.followers) + '</span><span title="Visitas">👁️ ' + numero(store.views) + '</span><span title="Contactos">☎ ' + numero(store.contacts) + '</span><span class="admin-estado ' + (active ? 'is-ativo' : 'is-bloqueado') + '">' + (active ? '● Ativa' : '⛔ Suspensa') + '</span></div></div><div class="admin-acoes admin-acoes-compact"><button type="button" title="' + (active ? 'Suspender loja' : 'Reativar loja') + '" aria-label="' + (active ? 'Suspender loja' : 'Reativar loja') + '" data-admin-store-status="' + store.id + '" data-active="' + String(!active) + '">' + (active ? '⏸️' : '▶️') + '</button></div></article>';
        }).join("") || "<p>Ainda não existem lojas registadas.</p>";
      } catch (e) { storesEl.textContent = e.message || "Não foi possível carregar as lojas."; }
    }
    if (recoveriesEl) {
      try {
        const pending = await pedidoAPI("/api/admin/password-recovery-requests");
        recoveriesEl.innerHTML = (pending.requests || []).map(r => '<article class="admin-item"><div><strong>' + escaparHTML(r.name || "Utilizador") + '</strong><p>E-mail: ' + escaparHTML(r.email) + ' · Telefone: ' + escaparHTML(r.phone || "Não indicado") + '</p><p>Pedido #' + r.id + ' · ' + escaparHTML(r.requested_at || "") + '</p></div><div class="admin-acoes"><button type="button" data-admin-recovery-approve="' + r.id + '">Aprovar e gerar senha</button><button type="button" data-admin-recovery-reject="' + r.id + '">Rejeitar</button></div></article>').join("") || "<p>Não há pedidos pendentes.</p>";
      } catch (e) { recoveriesEl.textContent = e.message || "Não foi possível carregar os pedidos."; }
    }
  } catch (erro) {
    statsEl.textContent = erro.message || "Não foi possível carregar o painel.";
    usersEl.innerHTML = ""; productsEl.innerHTML = "";
  }
}
function configurarPainelAdmin() {
  const abrir = $("#admin-abrir"), painel = $("#area-admin");
  if (!abrir || !painel) return;
  abrir.hidden = !Boolean(utilizadorAtual?.isAdmin);
  abrir.addEventListener("click", () => { painel.hidden = !painel.hidden; if (!painel.hidden) carregarPainelAdmin(); });
  $("#admin-atualizar")?.addEventListener("click", carregarPainelAdmin);
  const phrasesBox=document.getElementById("admin-frases-iniciais");
  if(phrasesBox){
   const defaults=[
    {etiqueta:"O teu mercado, num só lugar",titulo:"Encontra. Compara. Compra.",descricao:"Descobre anúncios recentes de vários vendedores em Angola ou publica o teu produto."},
    {etiqueta:"Boas oportunidades esperam por ti",titulo:"Descobre. Escolhe. Poupa.",descricao:"Compara produtos novos e usados, explora opções e encontra uma oferta que combina contigo."},
    {etiqueta:"O teu próximo cliente está mais perto",titulo:"Publica. Conecta. Vende.",descricao:"Mostra o teu produto a pessoas de todo o país e combina diretamente com os interessados."},
    {etiqueta:"Mil possibilidades, num só lugar",titulo:"Procura. Encontra. Aproveita.",descricao:"Explora várias categorias e descobre produtos anunciados por vendedores de Angola."}
   ];
   const render=items=>{phrasesBox.innerHTML=items.map((p,i)=>'<fieldset><legend>Cartão '+(i+1)+'</legend><label>Etiqueta<input maxlength="80" data-phrase="etiqueta" value="'+escaparHTML(p.etiqueta)+'"></label><label>Título<input maxlength="100" data-phrase="titulo" value="'+escaparHTML(p.titulo)+'"></label><label>Descrição<textarea maxlength="240" data-phrase="descricao">'+escaparHTML(p.descricao)+'</textarea></label></fieldset>').join("")+'<button type="button" id="admin-guardar-frases">Guardar frases</button>';};
   pedidoAPI("/api/site-settings").then(d=>render(Array.isArray(d.phrases)&&d.phrases.length?d.phrases:defaults)).catch(()=>render(defaults));
   phrasesBox.addEventListener("click",async e=>{
    if(e.target.id!=="admin-guardar-frases")return;
    const phrases=Array.from(phrasesBox.querySelectorAll("fieldset")).map(f=>Object.fromEntries(["etiqueta","titulo","descricao"].map(k=>[k,f.querySelector('[data-phrase="'+k+'"]').value.trim()])));
    try{await pedidoAPI("/api/admin/site-phrases",{method:"PUT",body:{phrases}});mostrarMensagem("Frases dos cartões guardadas.","sucesso");}
    catch(err){mostrarMensagem(err.message||"Não foi possível guardar as frases.","erro");}
   });
  }
  painel.addEventListener("click", async evento => {
    const b = evento.target.closest("button");
    if (!b) return;
    try {
      if (b.dataset.adminRecoveryApprove) {
        const result = await pedidoAPI("/api/admin/password-recovery-requests/" + b.dataset.adminRecoveryApprove + "/approve", { method: "POST", body: {} });
        alert("Pedido aprovado para: " + result.email + "\n\nPALAVRA-PASSE TEMPORÁRIA (aparece apenas agora):\n" + result.temporaryPassword + "\n\nCopia-a e entrega-a ao utilizador por um canal seguro.");
      } else if (b.dataset.adminRecoveryReject) {
        if (!confirm("Rejeitar este pedido de recuperação?")) return;
        await pedidoAPI("/api/admin/password-recovery-requests/" + b.dataset.adminRecoveryReject + "/reject", { method: "POST", body: {} });
      } else if (b.dataset.adminUserBlock) {
        await pedidoAPI("/api/admin/users/" + b.dataset.adminUserBlock + "/block", { method: "PATCH", body: { blocked: b.dataset.blocked === "true" } });
      } else if (b.dataset.adminUserDelete) {
        if (!confirm("Eliminar definitivamente este utilizador?")) return;
        await pedidoAPI("/api/admin/users/" + b.dataset.adminUserDelete, { method: "DELETE" });
      } else if (b.dataset.adminProductBlock) {
        await pedidoAPI("/api/admin/products/" + b.dataset.adminProductBlock + "/block", { method: "PATCH", body: { blocked: b.dataset.blocked === "true" } });
      } else if (b.dataset.adminProductDelete) {
        if (!confirm("Eliminar definitivamente este anúncio?")) return;
        await pedidoAPI("/api/admin/products/" + b.dataset.adminProductDelete, { method: "DELETE" });
      } else if (b.dataset.adminStoreStatus) {
        const active = b.dataset.active === "true";
        if (!confirm((active ? "Reativar" : "Suspender") + " esta loja?")) return;
        await pedidoAPI("/api/admin/stores/" + b.dataset.adminStoreStatus + "/status", { method: "PATCH", body: { active } });
      } else return;
      mostrarMensagem("Ação administrativa concluída.", "sucesso");
      await carregarPainelAdmin();
      await carregarProdutos();
    } catch (erro) { mostrarMensagem(erro.message || "Não foi possível concluir a ação.", "erro"); }
  });
}

function configurarBannerDestaque() {
  const banner = document.getElementById("bisno-banner-destaque");
  const titulo = document.getElementById("bisno-banner-titulo");
  const descricao = document.getElementById("bisno-banner-descricao");
  const etiqueta = document.getElementById("bisno-banner-etiqueta");
  if (!banner || !titulo || !descricao || !etiqueta || banner.dataset.rotacaoIniciada === "true") return;
  banner.dataset.rotacaoIniciada = "true";
  let destaques = [
    { etiqueta: "O teu mercado, num só lugar", titulo: "Encontra. Compara. Compra.", descricao: "Descobre anúncios recentes de vários vendedores em Angola ou publica o teu produto.", cor: 0 },
    { etiqueta: "Boas oportunidades esperam por ti", titulo: "Descobre. Escolhe. Poupa.", descricao: "Compara produtos novos e usados, explora opções e encontra uma oferta que combina contigo.", cor: 1 },
    { etiqueta: "O teu próximo cliente está mais perto", titulo: "Publica. Conecta. Vende.", descricao: "Mostra o teu produto a pessoas de todo o país e combina diretamente com os interessados.", cor: 2 },
    { etiqueta: "Mil possibilidades, num só lugar", titulo: "Procura. Encontra. Aproveita.", descricao: "Explora várias categorias e descobre produtos anunciados por vendedores de Angola.", cor: 3 }
  ];
  const indicadores = Array.from(banner.querySelectorAll("[data-banner-slide]"));
  let atual = 0;
  let temporizador = null;
  function mostrarDestaque(indice) {
    atual = (indice + destaques.length) % destaques.length;
    const item = destaques[atual];
    etiqueta.textContent = item.etiqueta;
    titulo.textContent = item.titulo;
    descricao.textContent = item.descricao;
    banner.classList.remove("bisno-banner-slide-0", "bisno-banner-slide-1", "bisno-banner-slide-2", "bisno-banner-slide-3");
    banner.classList.add("bisno-banner-slide-" + item.cor);
    indicadores.forEach((botao, i) => {
      botao.classList.toggle("is-active", i === atual);
      botao.setAttribute("aria-pressed", String(i === atual));
    });
  }
  function agendarProximo() {
    window.clearTimeout(temporizador);
    temporizador = window.setTimeout(() => {
      if (!document.hidden) mostrarDestaque(atual + 1);
      agendarProximo();
    }, 4000);
  }
  indicadores.forEach(botao => botao.addEventListener("click", () => {
    mostrarDestaque(Number(botao.dataset.bannerSlide) || 0);
    agendarProximo();
  }));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) agendarProximo();
    else window.clearTimeout(temporizador);
  });
  mostrarDestaque(0);
  agendarProximo();
  pedidoAPI("/api/site-settings").then(data=>{
    if(!Array.isArray(data.phrases)||!data.phrases.length)return;
    destaques=data.phrases.map((p,i)=>({etiqueta:p.etiqueta,titulo:p.titulo,descricao:p.descricao,cor:i%4}));
    indicadores.forEach((button,i)=>{button.hidden=i>=destaques.length;});
    mostrarDestaque(0); agendarProximo();
  }).catch(()=>{});
}


function configurarPedidosProcura() {
  const form = document.getElementById("form-pedido-procura");
  const lista = document.getElementById("lista-pedidos-procura");
  const atualizar = document.getElementById("botao-atualizar-pedidos");
  if (!form || !lista || form.dataset.configurado === "true") return;
  form.dataset.configurado = "true";

  async function carregar() {
    lista.innerHTML = "<p>A carregar pedidos...</p>";
    try {
      const dados = await pedidoAPI("/api/wanted", { cache: "no-store" });
      if (!dados.ads || !dados.ads.length) {
        lista.innerHTML = "<p>Ainda não existem pedidos de procura. Sê o primeiro a publicar!</p>";
        return;
      }
      lista.innerHTML = dados.ads.map(ad => {
        const contacto = /^https:\/\/wa\.me\/[0-9]+\?/.test(ad.contact_url || "") ? ad.contact_url : "";
        const meuPedido = Number(ad.user_id) === Number(obterIdUtilizador());
        return `<article class="cartao-produto bisno-pedido-procura" data-created-at="${escaparHTML(ad.created_at || "")}">
          <span class="etiqueta-comprador">COMPRADOR</span>
          <h3>${escaparHTML(ad.product_name)}</h3>
          <p>${escaparHTML(ad.description)}</p>
          <p class="bisno-pedido-orcamento"><strong>Orçamento:</strong> ${ad.budget == null ? "A combinar" : escaparHTML(Number(ad.budget).toLocaleString("pt-AO")) + " Kz"}</p><p class="bisno-pedido-local"><small>📍 ${escaparHTML(ad.city)}</small></p>
          ${ad.image ? '<img class="bisno-pedido-imagem" src="' + escaparHTML(obterImagem(ad.image)) + '" alt="Imagem do pedido" loading="lazy">' : ""}
          <p><small>Publicado por ${escaparHTML(ad.buyer_name)}</small></p>
          ${contacto ? `<a class="botao-secundario" href="${escaparHTML(contacto)}" target="_blank" rel="noopener noreferrer" aria-label="Contactar ${escaparHTML(ad.buyer_name)} pelo WhatsApp">☏ Contactar pelo WhatsApp</a>` : "<p>O comprador ainda não tem um contacto válido.</p>"}
          ${meuPedido ? `<button type="button" data-encerrar-pedido="${Number(ad.id)}" class="botao-secundario" aria-label="Encerrar este pedido">✓ Encerrar pedido</button>` : ""}
        </article>`;
      }).join("");
    } catch (error) {
      lista.innerHTML = "<p>Não foi possível carregar os pedidos. Tenta novamente.</p>";
    }
  }
  const campoImagem = form.querySelector('input[name="image"]');
  const preview = document.getElementById("pedido-procura-preview");
  let urlPreview = null;
  function limparPreview() {
    if (urlPreview) URL.revokeObjectURL(urlPreview);
    urlPreview = null;
    if (preview) { preview.hidden = true; preview.replaceChildren(); }
  }
  campoImagem?.addEventListener("change", () => {
    limparPreview();
    const file = campoImagem.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      campoImagem.value = "";
      mostrarMensagem("Escolhe uma imagem JPG, PNG ou WEBP.", "erro");
      return;
    }
    if (file.size > LIMITE_IMAGEM) {
      campoImagem.value = "";
      mostrarMensagem("A imagem do pedido não pode ultrapassar 5 MB.", "erro");
      return;
    }
    if (preview) {
      urlPreview = URL.createObjectURL(file);
      const img = document.createElement("img");
      img.src = urlPreview;
      img.alt = "Pré-visualização da imagem do pedido";
      img.className = "bisno-pedido-imagem";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "botao-secundario";
      remove.textContent = "Remover imagem";
      remove.addEventListener("click", () => { campoImagem.value = ""; limparPreview(); });
      preview.replaceChildren(img, remove);
      preview.hidden = false;
    }
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    event.stopPropagation();
    if (form.dataset.publicando === "true") return;
    if (!exigirLogin()) return;

    const campo = nome => form.elements.namedItem(nome);
    const produto = String(campo("product_name")?.value || "").trim();
    const descricao = String(campo("description")?.value || "").trim();
    const cidade = String(campo("city")?.value || "").trim();
    const orcamento = String(campo("budget")?.value || "").trim();
    if (produto.length < 2 || descricao.length < 5 || cidade.length < 2) {
      mostrarMensagem("Preenche o produto, uma descrição com pelo menos 5 caracteres e a cidade/província.", "erro");
      return;
    }
    if (orcamento && (!Number.isSafeInteger(Number(orcamento)) || Number(orcamento) < 0 || Number(orcamento) > 1000000000000)) {
      mostrarMensagem("O orçamento deve ser um número inteiro válido em Kz.", "erro");
      return;
    }

    const body = new FormData(form);
    const wantedImage = body.get("image");
    // A imagem é opcional: remover ficheiros vazios que alguns navegadores enviam.
    if (!(wantedImage instanceof File) || wantedImage.size === 0) body.delete("image");
    else if (wantedImage.size > LIMITE_IMAGEM || !["image/jpeg", "image/png", "image/webp"].includes(wantedImage.type)) {
      mostrarMensagem("A imagem deve ser JPG, PNG ou WEBP e não pode ultrapassar 5 MB.", "erro");
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    const textoOriginal = submit?.textContent || "＋ Publicar pedido";
    form.dataset.publicando = "true";
    if (submit) { submit.disabled = true; submit.textContent = "A publicar…"; }
    try {
      const resultado = await pedidoAPI("/api/wanted", { method: "POST", body });
      form.reset();
      limparPreview();
      mostrarMensagem(resultado.mensagem || "Pedido publicado com sucesso!", "sucesso");
      await carregar();
    } catch (error) {
      mostrarMensagem(error.message || "Não foi possível publicar o pedido. Confirma a ligação e tenta novamente.", "erro");
    } finally {
      delete form.dataset.publicando;
      if (submit) { submit.disabled = false; submit.textContent = textoOriginal; }
    }
  });
  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-encerrar-pedido]");
    if (!button) return;
    if (!confirm("Queres encerrar este pedido de procura?")) return;
    try {
      await pedidoAPI("/api/wanted/" + button.dataset.encerrarPedido, { method: "DELETE" });
      mostrarMensagem("Pedido encerrado.", "sucesso");
      await carregar();
    } catch (error) { mostrarMensagem(error.message || "Não foi possível encerrar o pedido.", "erro"); }
  });
  atualizar?.addEventListener("click", carregar);
  window.bisnoCarregarPedidosProcura = carregar;
}

function configurarMenuPublicacao() {
  const menu = document.getElementById("menu-superior");
  const publicar = document.getElementById("menu-publicar-overlay");
  const toggle = (element, show) => { if (element) element.hidden = !show; };
  const fechar = () => { toggle(menu, false); toggle(publicar, false); $("#botao-abrir-menu")?.setAttribute("aria-expanded", "false"); };
  $("#botao-abrir-menu")?.addEventListener("click", () => { const show = menu?.hidden !== false; toggle(menu, show); toggle(publicar, false); $("#botao-abrir-menu")?.setAttribute("aria-expanded", String(show)); });
  document.querySelectorAll("[data-abrir-publicacao]").forEach(button => button.addEventListener("click", () => {
    if (!utilizadorAtual) { mostrarAba("login"); abrirPagina("area-autenticacao"); return; }
    toggle(menu, false); toggle(publicar, true); $("#botao-abrir-menu")?.setAttribute("aria-expanded", "false");
  }));
  document.querySelectorAll("[data-fechar-overlay]").forEach(button => button.addEventListener("click", fechar));
  document.querySelectorAll("[data-publicar-tipo]").forEach(button => button.addEventListener("click", () => {
    if (!utilizadorAtual) { fechar(); mostrarAba("login"); abrirPagina("area-autenticacao"); return; }
    const type = button.dataset.publicarTipo; fechar();
    if (type === "vendedor") { abrirPagina("area-publicar"); return; }
    if (type === "comprador") { abrirPagina("area-pedidos-procura"); window.bisnoCarregarPedidosProcura?.(); return; }
  }));
  document.querySelectorAll("[data-menu-acao]").forEach(button => button.addEventListener("click", () => {
    const action = button.dataset.menuAcao; fechar();
    if (action === "support") { window.open("https://www.facebook.com/profile.php?id=61595803947715", "_blank", "noopener,noreferrer"); return; }
    if (action === "accessibility") { document.body.classList.toggle("bisno-acessibilidade-grande"); mostrarMensagem(document.body.classList.contains("bisno-acessibilidade-grande") ? "Texto ampliado ativado." : "Texto ampliado desativado.", "info"); return; }
    if (!utilizadorAtual) { mostrarAba("login"); abrirPagina("area-autenticacao"); return; }
    if (action === "notifications") { abrirPagina("area-notificacoes"); abrirNotificacoesEMarcarLidas(); }
    else if (action === "messages") { abrirPagina("area-mensagens"); atualizarConversas(); }
    else if (action === "stores") { abrirPagina("area-diretorio-lojas"); carregarDiretorioLojas(); }
    else if (action === "wanted") { abrirPagina("area-pedidos-procura"); window.bisnoCarregarPedidosProcura?.(); }
    else if (action === "store") { abrirPagina("area-loja"); carregarMinhaLoja(); }
    else if (action === "listings") { abrirPagina("area-meus-anuncios"); carregarMeusAnuncios(); }
    else if (action === "profile") abrirPagina("area-conta");
  }));
  $("#botao-chave-password")?.addEventListener("click", () => {
    const form = $("#form-alterar-password");
    if (!form) return;
    form.hidden = !form.hidden;
    if (!form.hidden) form.querySelector('input[name="current_password"]')?.focus();
  });
  $("#form-alterar-password")?.addEventListener("submit", async event => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    try { const result = await pedidoAPI("/api/auth/change-password", { method: "POST", body: { current_password: data.get("current_password"), new_password: data.get("new_password") } }); form.reset(); mostrarMensagem(result.mensagem || "Palavra-passe alterada.", "sucesso"); }
    catch (error) { mostrarMensagem(error.message || "Não foi possível alterar a palavra-passe.", "erro"); }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  // Inicializar os componentes primeiro, mas só escolher a página depois de confirmar a sessão.
  configurarBannerDestaque();
  configurarPainelPesquisa();
  configurarMenuPublicacao();
  configurarNavegacao();
  configurarFormularios();
  configurarLoja();
  configurarPedidosProcura();
  configurarDiretorioLojas();
  configurarPainelAdmin();
  configurarFiltros();
  configurarEventosProdutos();

  const paramsRecuperacao = new URLSearchParams(window.location.search);
  if (paramsRecuperacao.get("reset") && paramsRecuperacao.get("email")) {
    mostrarAba("login");
    mostrarMensagem("Segue o processo de recuperação para definir uma nova palavra-passe.", "info");
  } else mostrarAba("login");

  // Evita a corrida entre a navegação inicial e /api/auth/me, que podia deixar
  // todos os painéis ocultos depois de atualizar a página.
  await verificarSessao().catch(erro => {
    console.warn("Não foi possível confirmar a sessão agora:", erro);
    return null;
  });

  if (utilizadorAtual) {
    document.body.classList.add("bisno-autenticado");
    document.body.classList.remove("bisno-requer-login", "bisno-sem-sessao");
    abrirPagina("area-produtos");
    atualizarAreasSociais();
  } else {
    document.body.classList.remove("bisno-autenticado");
    document.body.classList.add("bisno-requer-login", "bisno-sem-sessao");
    mostrarAba("login");
    abrirPagina("area-autenticacao");
  }

  window.setInterval(() => {
    if (utilizadorAtual && !document.hidden) verificarMensagensNovas().catch(() => {});
  }, 5000);

  // Carregamento das listas não bloqueia a apresentação do painel inicial.
  await Promise.allSettled([carregarProdutos(), carregarCategoriasProdutos()]);
  if (utilizadorAtual) abrirPagina("area-produtos");
});


/* Instalação do Bisno como aplicação no dispositivo */
let eventoInstalacaoBisno = null;
function configurarInstalacaoBisno() {
  const botao = document.getElementById("botao-baixar-aplicativo");
  const estado = document.getElementById("estado-download-aplicativo");
  if (!botao || botao.dataset.configurado === "true") return;
  botao.dataset.configurado = "true";

  const mostrarEstado = texto => {
    if (estado) estado.textContent = texto;
  };

  const jaInstalado = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  window.addEventListener("beforeinstallprompt", evento => {
    evento.preventDefault();
    eventoInstalacaoBisno = evento;
    botao.disabled = false;
    botao.textContent = "⬇ Instalar aplicativo Bisno";
    mostrarEstado("O Bisno está pronto para ser instalado neste dispositivo.");
  });

  window.addEventListener("appinstalled", () => {
    eventoInstalacaoBisno = null;
    botao.textContent = "✓ Bisno instalado";
    botao.disabled = true;
    mostrarEstado("O Bisno foi instalado com sucesso.");
  });

  botao.addEventListener("click", async () => {
    if (jaInstalado()) {
      mostrarEstado("O Bisno já está instalado neste dispositivo.");
      return;
    }

    // Primeiro tenta o diálogo nativo de instalação do navegador.
    let promptDisponivel = eventoInstalacaoBisno;
    if (!promptDisponivel && typeof window.bisnoInstalarAplicacao === "function") {
      try {
        const instalado = await window.bisnoInstalarAplicacao();
        if (instalado) {
          mostrarEstado("Instalação aceite. Segue as instruções do teu dispositivo.");
          return;
        }
      } catch (erro) {
        console.warn("Não foi possível abrir a instalação nativa:", erro);
      }
      promptDisponivel = eventoInstalacaoBisno;
    }

    if (promptDisponivel) {
      try {
        promptDisponivel.prompt();
        const escolha = await promptDisponivel.userChoice;
        eventoInstalacaoBisno = null;
        if (escolha?.outcome === "accepted") {
          mostrarEstado("Pedido de instalação aceite. Aguarda a conclusão no navegador.");
        } else {
          mostrarEstado("A instalação foi cancelada. Toca novamente para tentar.");
        }
      } catch (erro) {
        console.warn("Falha ao iniciar a instalação:", erro);
        mostrarEstado("Não foi possível abrir a instalação agora. Usa o menu do navegador.");
      }
      return;
    }

    // Quando o navegador não oferece o diálogo automático, explica o caminho real.
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      mostrarEstado("No Safari: toca em Partilhar e escolhe “Adicionar ao ecrã principal”.");
    } else if (/android/i.test(navigator.userAgent)) {
      mostrarEstado("No Chrome: abre o menu ⋮ e toca em “Instalar aplicação” ou “Adicionar ao ecrã principal”.");
    } else {
      mostrarEstado("No Chrome ou Edge: abre o menu do navegador e escolhe “Instalar Bisno” ou “Instalar aplicação”.");
    }
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(erro => {
        console.warn("Não foi possível preparar a instalação offline:", erro.message);
        mostrarEstado("A instalação depende de uma ligação segura e de um navegador compatível.");
      });
    }, { once: true });
  }
}

document.addEventListener("DOMContentLoaded", configurarInstalacaoBisno);
