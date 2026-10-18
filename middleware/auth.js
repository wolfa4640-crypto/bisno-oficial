
function exigirLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      erro: "Tens de iniciar sessão primeiro."
    });
  }

  next();
}

module.exports = exigirLogin;
