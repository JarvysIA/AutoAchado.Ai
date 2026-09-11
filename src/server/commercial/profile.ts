// Explicit, versioned editorial hypotheses; these are not measured conversion rates.
export function commercialProfile(title: string) {
  const text = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/rastreador|rack de teto|bagageiro|mensalidade|assinatura/.test(text))
    return {group:"especializado", appeal:20, ease:15, reason:"Uso específico ou possível instalação/recorrência; fora do perfil amplo inicial."};
  // A key mentioned in an alarm is not a tool. Keep uncertain fit/installation in review.
  if (/\balarme\b|\bstart stop\b|\bpartida remota\b|\bchaveiro\b|(?:capa|carcaca).*chave|chave.*(?:canivete|codificada|ignicao)/.test(text)
    || (/\bkit macaco\b/.test(text) && /\bfiat\b|\bargo\b|\bcronos\b/.test(text)))
    return {group:"avaliar",appeal:40,ease:30,reason:null};
  if (/aspirador/.test(text)) return {group:"aspiracao",appeal:90,ease:85,reason:null};
  if (/compressor|calibrador|inflador/.test(text)) return {group:"pneus",appeal:85,ease:75,reason:null};
  if (/carregador.*bateria/.test(text)) return {group:"bateria",appeal:75,ease:60,reason:null};
  if (/carregador|suporte.*celular|cabo usb/.test(text)) return {group:"celular",appeal:85,ease:85,reason:null};
  if (/organizador|lixeira|protetor solar|quebra.sol/.test(text)) return {group:"organizacao",appeal:75,ease:85,reason:null};
  if (/microfibra|shampoo|cera|limpador|limpeza|vonixx|lavagem/.test(text)) return {group:"limpeza",appeal:65,ease:85,reason:null};
  if (/ferramenta|\bchaves?\b|\bsoquetes?\b|\bcatracas?\b|\balicates?\b|\btorquimetro\b|\bmacaco\b|\bcavaletes?\b|(?:luz|espelho).*inspecao|lanterna|kit.*reparo/.test(text)) return {group:"ferramentas",appeal:75,ease:75,reason:null};
  return {group:"avaliar",appeal:40,ease:40,reason:null};
}

