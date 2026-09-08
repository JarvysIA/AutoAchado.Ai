import {describe,it,expect} from 'vitest';
import {commercialProfile,orderCommercialFamilies} from '../src/server/commercial/ranking.js';
describe('editorial review from monitored examples',()=>{
 it('does not classify alarm keys, key covers or model-specific kits as universal tools',()=>{
  for(const title of ['Sistema de Alarme Antifurto Motocicleta Chave E Buzina',
   'Capa Chaveiro Compatível Byd Song Plus','Kit Start Stop Universal com 2 Chaves',
   'Kit Macaco Chave Roda Fiat Argo Cronos 2019 2025']) expect(commercialProfile(title).group).toBe('avaliar');
  expect(commercialProfile('Macaco Mecânico Kit Estepe Universal Chave De Roda Triângulo').group).toBe('ferramentas');
 });
 it('separates vehicle battery chargers from phone accessories and retains compressor combinations',()=>{
  expect(commercialProfile('Carregador Inteligente De Bateria Automotiva 12v').group).toBe('bateria');
  expect(commercialProfile('Auxiliar de Partida Carregador Bateria Com Compressor de Ar').group).toBe('pneus');
  expect(commercialProfile('Suporte Celular Carregador USB').group).toBe('celular');
 });
 it('spreads families through pages without hiding any product or promoting unapproved products',()=>{
  const rows=Array.from({length:25},(_,id)=>({id,rank:{state:'APPROVED' as const,group:'limpeza'}}));
  const other={id:25,rank:{state:'APPROVED' as const,group:'pneus'}};
  const observing={id:26,rank:{state:'OBSERVING' as const,group:'celular'}};
  const ordered=orderCommercialFamilies([...rows,other,observing]);
  expect(ordered.slice(0,3).map(row=>row.id)).toEqual([0,25,1]);
  expect(ordered).toHaveLength(27);expect(new Set(ordered.map(row=>row.id)).size).toBe(27);
  expect(ordered.at(-1)?.id).toBe(26);
 });
});
