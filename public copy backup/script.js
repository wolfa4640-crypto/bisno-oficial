
const mensagem = document.getElementById("mensagem");
const areaAutenticacao = document.getElementById("area-autenticacao");
const areaConta = document.getElementById("area-conta");

const formLogin = document.getElementById("form-login");
const formRegisto = document.getElementById("form-registo");
const formAnuncio = document.getElementById("form-anuncio");
const formPerfil = document.getElementById("form-perfil");

const abaLogin = document.getElementById("aba-login");
const abaRegisto = document.getElementById("aba-registo");

const listaProdutos = document.getElementById("lista-produtos");
const filtroPesquisa = document.getElementById("filtro-pesquisa");
const filtroCategoria = document.getElementById("filtro-categoria");
const filtroCidade = document.getElementById("filtro-cidade");
const filtroPreco = document.getElementById("filtro-preco");

const fotoPerfil = document.getElementById("foto-perfil");
const perfilSemFoto = document.getElementById("perfil-sem-foto");
const perfilNome = document.getElementById("perfil-nome");
const perfilNomeInput = document.getElementById("perfil-nome-input");
const perfilTelefoneInput = document.getElementById("perfil-telefone-input");
const perfilFotoInput = document.getElementById("perfil-foto-input");

const listaMeusAnuncios = document.getElementById("lista-meus-anuncios");
const botaoAtualizarAnuncios = document.getElementById("botao-atualizar-anuncios");

let produtosCarregados = [];
let utilizadorAtual = null;

function mostrarMensagem(texto, tipo = "sucesso") {
  mensagem.textContent = texto;
  mensagem.className = `mensagem ${tipo}`;
  mensagem.hidden = false;
}

function limparMensagem() {
  mensagem.hidden = true;
  mensagem.textContent = "";
}

function mostrarAba(tipo) {
  limparMensagem();

  const entrar = tipo === "login";
  formLogin.hidden = !entrar;
  formRegisto.hidden = entrar;

  abaLogin.classList.toggle("ativa", entrar);
  abaRegisto.classList.toggle("ativa", !entrar);
}

abaLogin.addEventListener("click", () => mostrarAba("login"));
abaRegisto.addEventListener("click", () => mostrarAba("registo"));

async function pedidoAPI(url, dados) {
  const opcoes = {
    method: dados !== undefined ? "POST" : "GET",
    credentials: "same-origin"
  };

  if (dados !== undefined) {
    opcoes.headers = { "Content-Type": "application/json" };
    opcoes.body = JSON.stringify(dados);
  }

  const resposta = await fetch(url, opcoes);
  const resultado = await resposta.json();

  if (!resposta.ok) {
    throw new Error(resultado.erro || "Ocorreu um erro.");
  }

  return resultado;
}

// PERFIL
function atualizarPerfil(utilizador) {
  utilizadorAtual = utilizador;

  document.getElementById("nome-utilizador").textContent =
    utilizador.name || "";

  document.getElementById("email-utilizador").textContent =
    utilizador.email || "";

  document.getElementById("telefone-utilizador").textContent =
    utilizador.phone || "Não indicado";

  perfilNome.textContent = utilizador.name || "Vendedor";
  perfilNomeInput.value = utilizador.name || "";
  perfilTelefoneInput.value = utilizador.phone || "";

  if (utilizador.avatar) {
    fotoPerfil.src = utilizador.avatar;
    fotoPerfil.hidden = false;
    perfilSemFoto.hidden = true;
  } else {
    fotoPerfil.removeAttribute("src");
    fotoPerfil.hidden = true;
    perfilSemFoto.hidden = false;
  }
}

function mostrarConta(utilizador) {
  atualizarPerfil(utilizador);

  areaAutenticacao.hidden = true;
  areaConta.hidden = false;

  limparMensagem();
  carregarMeusAnuncios();
}

function mostrarAutenticacao() {
  utilizadorAtual = null;
  areaConta.hidden = true;
  areaAutenticacao.hidden = false;

  if (listaMeusAnuncios) {
    listaMeusAnuncios.replaceChildren(
      criarTexto("p", "Inicia sessão para veres os teus anúncios.")
    );
  }

  mostrarAba("login");
}

// REGISTO
formRegisto.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  limparMensagem();

  const dados = Object.fromEntries(new FormData(formRegisto));

  try {
    const resultado = await pedidoAPI("/api/auth/register", dados);
    formRegisto.reset();

    const conta = await pedidoAPI("/api/auth/me");
    mostrarConta(conta.utilizador);
    await carregarProdutos();

    mostrarMensagem(resultado.mensagem || "Conta criada com sucesso!");
  } catch (erro) {
    mostrarMensagem(erro.message, "erro");
  }
});

// LOGIN
formLogin.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  limparMensagem();

  const dados = Object.fromEntries(new FormData(formLogin));

  try {
    const resultado = await pedidoAPI("/api/auth/login", dados);
    formLogin.reset();

    const conta = await pedidoAPI("/api/auth/me");
    mostrarConta(conta.utilizador);
    await carregarProdutos();

    mostrarMensagem(resultado.mensagem || "Sessão iniciada com sucesso!");
  } catch (erro) {
    mostrarMensagem(erro.message, "erro");
  }
});

// PRÉ-VISUALIZAÇÃO DA FOTOGRAFIA DE PERFIL
perfilFotoInput.addEventListener("change", () => {
  const ficheiro = perfilFotoInput.files[0];

  if (!ficheiro) return;

  const tiposPermitidos = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!tiposPermitidos.includes(ficheiro.type)) {
    perfilFotoInput.value = "";
    mostrarMensagem("Escolhe uma imagem JPG, PNG ou WEBP.", "erro");
    return;
  }

  if (ficheiro.size > 5 * 1024 * 1024) {
    perfilFotoInput.value = "";
    mostrarMensagem("A fotografia não pode ultrapassar 5 MB.", "erro");
    return;
  }

  const leitor = new FileReader();

  leitor.onload = () => {
    fotoPerfil.src = leitor.result;
    fotoPerfil.hidden = false;
    perfilSemFoto.hidden = true;
  };

  leitor.readAsDataURL(ficheiro);
});

// GUARDAR PERFIL
formPerfil.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  limparMensagem();

  const botao = formPerfil.querySelector('button[type="submit"]');
  const textoOriginal = botao.textContent;

  botao.disabled = true;
  botao.textContent = "A guardar...";

  try {
    const dados = new FormData();

    dados.append("name", perfilNomeInput.value.trim());
    dados.append("phone", perfilTelefoneInput.value.trim());

    const fotografia = perfilFotoInput.files[0];

    if (fotografia) {
      dados.append("avatar", fotografia);
    }

    const resposta = await fetch("/api/auth/profile", {
      method: "PUT",
      credentials: "same-origin",
      body: dados
    });

    const resultado = await resposta.json();

    if (!resposta.ok) {
      throw new Error(
        resultado.erro || "Não foi possível atualizar o perfil."
      );
    }

    atualizarPerfil(resultado.utilizador);
    perfilFotoInput.value = "";

    mostrarMensagem(
      resultado.mensagem || "Perfil atualizado com sucesso!"
    );

    await carregarMeusAnuncios();
  } catch (erro) {
    mostrarMensagem(erro.message, "erro");
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
});

// TERMINAR SESSÃO
document.getElementById("botao-sair").addEventListener("click", async () => {
  try {
    const resultado = await pedidoAPI("/api/auth/logout", {});

    mostrarAutenticacao();
    mostrarMensagem(resultado.mensagem || "Sessão terminada.");
  } catch (erro) {
    mostrarMensagem(erro.message, "erro");
  }
});

// PUBLICAR ANÚNCIO
formAnuncio.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  limparMensagem();

  const botao = formAnuncio.querySelector('button[type="submit"]');
  const textoOriginal = botao.textContent;

  botao.disabled = true;
  botao.textContent = "A publicar...";

  try {
    const dados = new FormData(formAnuncio);

    const resposta = await fetch("/api/products", {
      method: "POST",
      credentials: "same-origin",
      body: dados
    });

    const resultado = await resposta.json();

    if (!resposta.ok) {
      throw new Error(resultado.erro || "Não foi possível publicar.");
    }

    formAnuncio.reset();

    await carregarProdutos();
    await carregarMeusAnuncios();

    mostrarMensagem(resultado.mensagem || "Anúncio publicado!");
  } catch (erro) {
    mostrarMensagem(erro.message, "erro");
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
});

// CRIAR TEXTO COM SEGURANÇA
function criarTexto(tag, texto, classe) {
  const elemento = document.createElement(tag);
  elemento.textContent = texto;

  if (classe) {
    elemento.className = classe;
  }

  return elemento;
}

function formatarPreco(preco) {
  return Number(preco).toLocaleString("pt-PT", {
    maximumFractionDigits: 0
  }) + " Kz";
}

// CARTÃO DO PRODUTO
function criarCartao(produto) {
  const cartao = document.createElement("article");
  cartao.className = "cartao-produto";

  if (produto.image) {
    const imagem = document.createElement("img");
    imagem.src = produto.image;
    imagem.alt = produto.name || "Fotografia do produto";
    imagem.loading = "lazy";
    imagem.className = "imagem-produto";
    cartao.appendChild(imagem);
  }

  cartao.appendChild(
    criarTexto("h3", produto.name, "nome-produto")
  );

  cartao.appendChild(
    criarTexto("p", formatarPreco(produto.price), "preco-produto")
  );

  cartao.appendChild(
    criarTexto("p", produto.description, "descricao-produto")
  );

  cartao.appendChild(
    criarTexto(
      "p",
      `${produto.condition} · ${produto.category}`,
      "detalhe-produto"
    )
  );

  cartao.appendChild(
    criarTexto(
      "p",
      `${produto.city}, ${produto.neighborhood}`,
      "localizacao-produto"
    )
  );

  cartao.appendChild(
    criarTexto(
      "p",
      `Vendedor: ${produto.seller_name || "Vendedor"}`,
      "vendedor-produto"
    )
  );

  if (produto.whatsapp) {
    const botaoWhatsApp = document.createElement("a");
    let numero = String(produto.whatsapp).replace(/\D/g, "");

    if (numero.length === 9) {
      numero = "244" + numero;
    }

    const textoWhatsApp =
      `Olá! Tenho interesse no teu anúncio: ${produto.name}.`;

    botaoWhatsApp.href =
      `https://wa.me/${numero}?text=${encodeURIComponent(textoWhatsApp)}`;

    botaoWhatsApp.target = "_blank";
    botaoWhatsApp.rel = "noopener noreferrer";
    botaoWhatsApp.className = "botao-whatsapp";
    botaoWhatsApp.textContent = "Contactar pelo WhatsApp";

    cartao.appendChild(botaoWhatsApp);
  }

  return cartao;
}

// FILTROS DO CATÁLOGO
function aplicarFiltros() {
  const pesquisa = filtroPesquisa.value.trim().toLocaleLowerCase("pt");
  const categoria = filtroCategoria.value;
  const cidade = filtroCidade.value.trim().toLocaleLowerCase("pt");

  const precoMaximo = filtroPreco.value.trim() === ""
    ? null
    : Number(filtroPreco.value);

  const filtrados = produtosCarregados.filter((produto) => {
    const textoProduto =
      `${produto.name} ${produto.description}`.toLocaleLowerCase("pt");

    const correspondePesquisa = textoProduto.includes(pesquisa);
    const correspondeCategoria =
      !categoria || produto.category === categoria;

    const textoLocalizacao =
      `${produto.city} ${produto.neighborhood}`.toLocaleLowerCase("pt");

    const correspondeCidade = !cidade || textoLocalizacao.includes(cidade);

    const correspondePreco =
      precoMaximo === null ||
      (Number.isFinite(precoMaximo) &&
        Number(produto.price) <= precoMaximo);

    return correspondePesquisa &&
      correspondeCategoria &&
      correspondeCidade &&
      correspondePreco;
  });

  listaProdutos.replaceChildren();

  if (filtrados.length === 0) {
    listaProdutos.appendChild(
      criarTexto("p", "Nenhum anúncio corresponde à tua pesquisa.")
    );
    return;
  }

  const fragmento = document.createDocumentFragment();

  filtrados.forEach((produto) => {
    fragmento.appendChild(criarCartao(produto));
  });

  listaProdutos.appendChild(fragmento);
}

// CARREGAR CATÁLOGO PÚBLICO
async function carregarProdutos() {
  listaProdutos.replaceChildren(
    criarTexto("p", "A carregar os anúncios...")
  );

  try {
    const resultado = await pedidoAPI("/api/products");

    produtosCarregados = Array.isArray(resultado.produtos)
      ? resultado.produtos
      : [];

    aplicarFiltros();
  } catch (erro) {
    listaProdutos.replaceChildren(
      criarTexto("p", "Não foi possível carregar os anúncios.")
    );

    console.error("Erro ao carregar anúncios:", erro);
  }
}

// CARREGAR OS MEUS ANÚNCIOS
async function carregarMeusAnuncios() {
  if (!listaMeusAnuncios || !utilizadorAtual) return;

  listaMeusAnuncios.replaceChildren(
    criarTexto("p", "A carregar os teus anúncios...")
  );

  try {
    const resultado = await pedidoAPI("/api/products/mine");
    const produtos = Array.isArray(resultado.produtos)
      ? resultado.produtos
      : [];

    listaMeusAnuncios.replaceChildren();

    if (produtos.length === 0) {
      listaMeusAnuncios.appendChild(
        criarTexto("p", "Ainda não publicaste nenhum anúncio.")
      );
      return;
    }

    const fragmento = document.createDocumentFragment();

    produtos.forEach((produto) => {
      const cartao = criarCartao({
        ...produto,
        seller_name: utilizadorAtual.name
      });

      const botaoEliminar = document.createElement("button");
      botaoEliminar.type = "button";
      botaoEliminar.className = "botao-secundario";
      botaoEliminar.textContent = "Eliminar anúncio";

      botaoEliminar.addEventListener("click", async () => {
        const confirmar = window.confirm(
          `Tens a certeza de que queres eliminar "${produto.name}"? Esta ação não pode ser desfeita.`
        );

        if (!confirmar) return;

        botaoEliminar.disabled = true;
        botaoEliminar.textContent = "A eliminar...";

        try {
          const resposta = await fetch(
            `/api/products/${encodeURIComponent(produto.id)}`,
            {
              method: "DELETE",
              credentials: "same-origin"
            }
          );

          const dados = await resposta.json();

          if (!resposta.ok) {
            throw new Error(
              dados.erro || "Não foi possível eliminar o anúncio."
            );
          }

          mostrarMensagem(dados.mensagem || "Anúncio eliminado com sucesso!");

          await carregarProdutos();
          await carregarMeusAnuncios();
        } catch (erro) {
          mostrarMensagem(erro.message, "erro");
          botaoEliminar.disabled = false;
          botaoEliminar.textContent = "Eliminar anúncio";
        }
      });

      cartao.appendChild(botaoEliminar);
      fragmento.appendChild(cartao);
    });

    listaMeusAnuncios.appendChild(fragmento);
  } catch (erro) {
    listaMeusAnuncios.replaceChildren(
      criarTexto(
        "p",
        erro.message || "Não foi possível carregar os teus anúncios."
      )
    );
  }
}

if (botaoAtualizarAnuncios) {
  botaoAtualizarAnuncios.addEventListener(
    "click",
    carregarMeusAnuncios
  );
}

// FILTROS AUTOMÁTICOS
[filtroPesquisa, filtroCategoria, filtroCidade, filtroPreco]
  .forEach((campo) => {
    campo.addEventListener("input", aplicarFiltros);
    campo.addEventListener("change", aplicarFiltros);
  });

// VERIFICAR SESSÃO
async function verificarSessao() {
  try {
    const resultado = await pedidoAPI("/api/auth/me");
    mostrarConta(resultado.utilizador);
  } catch {
    mostrarAutenticacao();
  }
}

carregarProdutos();
verificarSessao();
