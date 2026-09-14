-- Keep FASHION's identity and existing configuration; the user renamed its group.
update public.commercial_verticals set label='Moda Feminina',monitor_capacity=100,editorial_daily_target=3 where vertical_key='FASHION';
insert into public.commercial_verticals(vertical_key,label,enabled,monitor_capacity,editorial_daily_target,rules_version)
values('FASHION_MEN','Moda Masculina',false,100,3,null);
-- Gender-specific executors stay disabled until variant and quota validation.
