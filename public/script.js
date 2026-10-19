

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

  const configuracao = {

    credentials: "same-origin",

    ...opcoes,

    headers: {

      ...(opcoes.headers || {})

    }

  };



  if (

    configuracao.body &&

    !(configuracao.body instanceof FormData) &&

    typeof configuracao.body !== "string"

  ) {

    configuracao.headers["Content-Type"] = "application/json";

    configuracao.body = JSON.stringify(configuracao.body);

  }



  const resposta = await fetch(url, configuracao);



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
  const hero = document.querySelector(".hero-bisno");
  const auth = document.getElementById("area-autenticacao");
  const account = document.getElementById("area-conta");
  const products = document.getElementById("area-produtos");
  const messages = document.getElementById("area-mensagens");
  const publish = document.getElementById("area-publicar");
  const profile = document.getElementById("perfil-vendedor");
  const myAds = document.getElementById("area-meus-anuncios");
  const notifications = document.getElementById("area-notificacoes");
  const footer = document.querySelector("body > footer");
  const pageIds = ["area-produtos", "area-autenticacao", "area-conta", "area-publicar", "area-mensagens", "area-notificacoes"];

  if (hero) hero.hidden = id !== "area-produtos";
  if (auth) auth.hidden = id !== "area-autenticacao";
  if (products) products.hidden = id !== "area-produtos";
  // A conta funciona como contentor; apenas o painel escolhido fica visível.
  if (account) account.hidden = !["area-conta", "area-publicar", "area-mensagens", "area-notificacoes"].includes(id);
  if (messages) messages.hidden = id !== "area-mensagens";
  if (publish) publish.hidden = id !== "area-publicar";
  if (profile) profile.hidden = id !== "area-conta";
  if (myAds) myAds.hidden = id !== "area-conta";
  if (notifications) notifications.hidden = id !== "area-notificacoes";
  if (footer) footer.hidden = id !== "area-produtos";

  // Oculta separadores e conteúdo auxiliar da conta quando não fazem parte do perfil.
  if (account) {
    const children = Array.from(account.children);
    children.forEach(child => {
      if (child.id === "area-notificacoes") child.hidden = id !== "area-notificacoes";
      else if (child.id === "area-mensagens") child.hidden = id !== "area-mensagens";
      else if (child.id === "perfil-vendedor" || child.id === "area-meus-anuncios" || child.id === "botao-sair") child.hidden = id !== "area-conta";
      else if (child.tagName === "HR") child.hidden = id !== "area-conta";
      else if (child.classList.contains("dados-conta")) child.hidden = id !== "area-conta";
      else if (child.tagName === "H2" || child.tagName === "P") child.hidden = id !== "area-conta";
    });
  }

  document.querySelectorAll("[data-bisno-page]").forEach(link => {
    const page = link.dataset.bisnoPage;
    const active = (page === "home" && id === "area-produtos") ||
      (page === "messages" && id === "area-mensagens") ||
      (page === "notifications" && id === "area-notificacoes") ||
      (page === "publish" && id === "area-publicar") ||
      (page === "profile" && id === "area-conta");
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function mostrarAba(aba) {

  const login = $("#form-login");

  const registo = $("#form-registo");

  const botaoLogin = $("#aba-login");

  const botaoRegisto = $("#aba-registo");



  if (login) login.hidden = aba !== "login";

  if (registo) registo.hidden = aba !== "registo";



  botaoLogin?.classList.toggle("ativa", aba === "login");

  botaoRegisto?.classList.toggle("ativa", aba === "registo");



  botaoLogin?.setAttribute(

    "aria-pressed",

    String(aba === "login")

  );



  botaoRegisto?.setAttribute(

    "aria-pressed",

    String(aba === "registo")

  );

}



function configurarNavegacao() {
  $("#aba-login")?.addEventListener("click", () => mostrarAba("login"));
  $("#aba-registo")?.addEventListener("click", () => mostrarAba("registo"));

  document.querySelectorAll("[data-bisno-page]").forEach(link => {
    link.addEventListener("click", evento => {
      evento.preventDefault();
      const page = link.dataset.bisnoPage;
      if (page === "home") abrirPagina("area-produtos");
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



  const avatar =

    utilizadorAtual.avatar ??

    utilizadorAtual.foto ??

    utilizadorAtual.user?.avatar ??

    "";



  if (foto && avatar) {

    foto.src = obterImagem(avatar);

    foto.hidden = false;

    if (semFoto) semFoto.hidden = true;

  } else {

    if (foto) foto.hidden = true;

    if (semFoto) semFoto.hidden = false;

  }



  definirTexto("#perfil-nome", nomeUtilizadorAtual());

}



function mostrarConta() {

  const conta = $("#area-conta");

  const autenticacao = $("#area-autenticacao");



  if (conta) conta.hidden = !utilizadorAtual;

  if (autenticacao) autenticacao.hidden = Boolean(utilizadorAtual);



  if (utilizadorAtual) {

    atualizarPerfil();

    atualizarAreasSociais();

    carregarMeusAnuncios().catch(console.error);

  }

}



async function verificarSessao() {

  try {

    const dados = await pedidoAPI("/api/auth/me");



    utilizadorAtual =

      dados.utilizador ??

      dados.usuario ??

      dados.user ??

      (dados.id ? dados : null);



    mostrarConta();

  } catch (erro) {

    if (erro.status !== 401 && erro.status !== 404) {

      console.warn("Não foi possível verificar a sessão:", erro.message);

    }



    utilizadorAtual = null;

    mostrarConta();

  }

}



async function registarUtilizador(evento) {

  evento.preventDefault();

  esconderMensagem();



  const formulario = evento.currentTarget;

  const dados = Object.fromEntries(new FormData(formulario).entries());



  try {

    const resposta = await pedidoAPI("/api/auth/register", {

      method: "POST",

      body: dados

    });



    utilizadorAtual =

      resposta.utilizador ??

      resposta.usuario ??

      resposta.user ??

      null;



    if (!utilizadorAtual) {

      await verificarSessao();

    } else {

      mostrarConta();

    }
  

    formulario.reset();

    mostrarMensagem("Conta criada com sucesso!", "sucesso");

  } catch (erro) {

    mostrarMensagem(erro.message || "Não foi possível criar a conta.", "erro");

  }

}



async function entrarUtilizador(evento) {

  evento.preventDefault();

  esconderMensagem();



  const formulario = evento.currentTarget;

  const dados = Object.fromEntries(new FormData(formulario).entries());



  try {

    const resposta = await pedidoAPI("/api/auth/login", {

      method: "POST",

      body: dados

    });



    utilizadorAtual =

      resposta.utilizador ??

      resposta.usuario ??

      resposta.user ??

      null;



    if (!utilizadorAtual) {

      await verificarSessao();

    } else {

      mostrarConta();

    }



    formulario.reset();

    mostrarMensagem("Sessão iniciada com sucesso!", "sucesso");

    carregarProdutos().catch(console.error);

  } catch (erro) {

    mostrarMensagem(erro.message || "Não foi possível iniciar sessão.", "erro");

  }

}



async function guardarPerfil(evento) {

  evento.preventDefault();

  if (!exigirLogin()) return;



  const formulario = evento.currentTarget;

  const dados = new FormData(formulario);

  const ficheiro = $("#perfil-foto-input")?.files?.[0];



  if (ficheiro && ficheiro.size > LIMITE_IMAGEM) {

    mostrarMensagem("A fotografia do perfil não pode ultrapassar 5 MB.", "erro");

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

  try {

    await pedidoAPI("/api/auth/logout", {

      method: "POST"

    });

  } catch (erro) {

    console.warn("Erro ao terminar sessão no servidor:", erro.message);

  }



  fecharChat();

  utilizadorAtual = null;

  mostrarConta();

  mostrarAba("login");

  mostrarMensagem("Terminaste a sessão.", "sucesso");

  carregarProdutos().catch(console.error);

}



/* =========================================================

   ANÚNCIOS

   ========================================================= */



async function publicarAnuncio(evento) {

  evento.preventDefault();

  if (!exigirLogin()) return;



  const formulario = evento.currentTarget;

  const dados = new FormData(formulario);

  const imagem = $("#anuncio-imagem")?.files?.[0];



  if (imagem && imagem.size > LIMITE_IMAGEM) {

    mostrarMensagem("A imagem do produto não pode ultrapassar 5 MB.", "erro");

    return;

  }



  try {

    await pedidoAPI("/api/products", {

      method: "POST",

      body: dados

    });



    formulario.reset();



    mostrarMensagem("Anúncio publicado com sucesso!", "sucesso");



    await carregarProdutos();

    await carregarMeusAnuncios();



    abrirPagina("area-produtos");

  } catch (erro) {

    mostrarMensagem(erro.message || "Não foi possível publicar o anúncio.", "erro");

  }

}



async function carregarMeusAnuncios() {

  const lista = $("#lista-meus-anuncios");

  if (!lista || !utilizadorAtual) return;



  lista.innerHTML = "<p>A carregar os teus anúncios...</p>";



  try {

    const dados = await pedidoAPI("/api/products/mine");

    const produtos = dados.produtos ?? dados.products ?? [];



    if (!produtos.length) {

      lista.innerHTML = "<p>Ainda não publicaste anúncios.</p>";

      return;

    }



    lista.innerHTML = produtos.map(produto => `

      <article class="cartao-produto">

        <img

          src="${escaparHTML(obterImagem(produto.image))}"

          alt="${escaparHTML(produto.name)}"

          loading="lazy"

          onerror="this.onerror=null;this.src='${IMAGEM_PADRAO}'"

        >

        <div class="cartao-produto-conteudo">

          <h3>${escaparHTML(produto.name)}</h3>

          <p class="preco">${escaparHTML(formatarPreco(produto.price))}</p>

          <p>${escaparHTML(produto.city ?? "")}</p>

          <button type="button" data-apagar-anuncio="${escaparHTML(produto.id)}">

            Apagar anúncio

          </button>

        </div>

      </article>

    `).join("");

  } catch (erro) {

    lista.innerHTML = `<p>${escaparHTML(erro.message)}</p>`;

  }

}



async function apagarAnuncio(id) {

  if (!exigirLogin()) return;



  if (!confirm("Tens a certeza de que queres apagar este anúncio?")) return;



  try {

    await pedidoAPI(`/api/products/${encodeURIComponent(id)}`, {

      method: "DELETE"

    });



    mostrarMensagem("Anúncio apagado.", "sucesso");



    await carregarProdutos();

    await carregarMeusAnuncios();

  } catch (erro) {

    mostrarMensagem(erro.message || "Não foi possível apagar o anúncio.", "erro");

  }

}



/* =========================================================

   CARTÕES DE PRODUTOS E CATÁLOGO

   ========================================================= */



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



  return `

    <article class="cartao-produto" data-produto-id="${escaparHTML(id)}">

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



      <div class="cartao-produto-conteudo">

        <h3>${escaparHTML(produto.name)}</h3>

        <p class="preco">${escaparHTML(formatarPreco(produto.price))}</p>

        <p>${escaparHTML(produto.condition ?? "")}</p>

        <p>${escaparHTML(produto.category ?? "")}</p>

        <p>${escaparHTML(produto.city ?? "")}${produto.neighborhood ? " — " + escaparHTML(produto.neighborhood) : ""}</p>

<button type="button" data-interesse="${escaparHTML(id)}" class="botao-interesse" aria-pressed="false">

          ♡ Tenho interesse (<span data-total-interesses="${escaparHTML(id)}">0</span>)

        </button>



        <button

          type="button"

          data-ver-vendedor="${escaparHTML(obterIdVendedor(produto))}"

        >

          Ver vendedor

        </button>



        ${!eProdutoDoUtilizador(produto) ? `

          <button type="button" class="botao-mensagem" data-iniciar-conversa="${escaparHTML(id)}">

            Enviar mensagem

          </button>

        ` : ""}



        ${produto.whatsapp ? `

          <a

            class="botao-whatsapp"

            href="https://wa.me/${escaparHTML((() => { const n = String(produto.whatsapp).replace(/\D/g, ""); return n.startsWith("244") ? n : (n.length === 9 ? "244" + n : n); })())}"

            target="_blank"

            rel="noopener noreferrer"

          >

            Contactar no WhatsApp

          </a>

        ` : ""}



        <div class="vendedor-resumo vendedor-resumo-mini">
          <button type="button" class="avatar-vendedor-clicavel" data-ver-vendedor="${escaparHTML(obterIdVendedor(produto))}" aria-label="Ver perfil de ${escaparHTML(vendedor)}" title="Ver perfil de ${escaparHTML(vendedor)}">
            ${avatar ? `<img src="${escaparHTML(obterImagem(avatar))}" alt="">` : `<span>${escaparHTML((vendedor.trim().charAt(0) || "V").toUpperCase())}</span>`}
          </button>
          <button type="button" class="nome-vendedor-link" data-ver-vendedor="${escaparHTML(obterIdVendedor(produto))}">${escaparHTML(vendedor)}</button>
        </div>

      </div>

    </article>

  `;

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
    lista.innerHTML = `<p>${escaparHTML(erro.message || "Não foi possível carregar os produtos.")}</p>`;
    lista.setAttribute("aria-busy", "false");
    if (contagem) contagem.textContent = "Não foi possível carregar os anúncios. Tenta novamente.";
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
    lista.innerHTML = `<div class="estado-vazio-catalogo">
      <p class="estado-vazio-titulo">Não encontrámos anúncios com estes filtros.</p>
      <p>Tenta pesquisar por outras palavras, escolher outra categoria ou limpar os filtros.</p>
      <button type="button" class="botao-limpar-filtros" data-limpar-filtros>Limpar filtros</button>
    </div>`;
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



        <button

          type="button"

          data-interesse="${escaparHTML(id)}"

          aria-pressed="false"

        >

          ♡ Tenho interesse (<span data-total-interesses="${escaparHTML(id)}">0</span>)

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

            Contactar no WhatsApp

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

  document.querySelectorAll("[data-interesse]").forEach(botao => {

    if (String(botao.dataset.interesse) !== String(id)) return;



    botao.setAttribute("aria-pressed", String(Boolean(interessado)));

    botao.classList.toggle("interesse-ativo", Boolean(interessado));



    const contador = botao.querySelector("[data-total-interesses]");

    const quantidade = Math.max(0, numero(total));



    if (contador) {

      contador.textContent = String(quantidade);

    } else {

      botao.textContent = `${interessado ? "♥" : "♡"} Tenho interesse (${quantidade})`;

    }

  });



  document.querySelectorAll("[data-total-interesses]").forEach(elemento => {

    if (String(elemento.dataset.totalInteresses) === String(id)) {

      elemento.textContent = String(Math.max(0, numero(total)));

    }

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
    atualizarBadge("#badge-notificacoes", naoLidas);



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
    atualizarBadge("#badge-mensagens", totalNaoLidas);



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

function atualizarAreasSociais() {
  if (!utilizadorAtual) return;
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

  $("#form-login")?.addEventListener("submit", entrarUtilizador);

  $("#form-registo")?.addEventListener("submit", registarUtilizador);

  $("#form-perfil")?.addEventListener("submit", guardarPerfil);

  $("#form-anuncio")?.addEventListener("submit", publicarAnuncio);

  $("#form-enviar-mensagem")?.addEventListener("submit", enviarMensagem);



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



document.addEventListener("DOMContentLoaded", async () => {

  configurarNavegacao();

  configurarFormularios();

  configurarFiltros();

  configurarEventosProdutos();



  mostrarAba("login");



  await verificarSessao();
  atualizarAreasSociais();
  window.setInterval(() => { if (utilizadorAtual && !document.hidden) verificarMensagensNovas().catch(() => {}); }, 5000);

  await carregarProdutos();

});
