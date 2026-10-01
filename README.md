# Operação Vento Negro

Jogo de ação em primeira pessoa feito com Three.js e Vite, com uma campanha
de inserção por helicóptero, combate urbano, recuperação de inteligência e extração.

Para executar localmente, instale Node.js e rode:

```sh
npm install
npm run dev
```

Abra o endereço mostrado pelo Vite no navegador. `npm run build` gera a versão
em `dist`; `npm run preview` abre uma prévia desse build.

As 30 falas da campanha estão em `public/assets/voices`, geradas no ElevenLabs
com o modelo `eleven_v4` e cinco vozes distintas. O capitão usa Daniel com
direção séria e firme; Eric, Callum, Liam e Chris interpretam os outros quatro
personagens. Cada fala tem direção de entonação em `scripts/voice-direction.json`:
ordens firmes, urgência sob fogo, comunicação de rádio e encerramento mais calmo.
As indicações ficam apenas na geração, sem aparecer nas legendas. O jogo carrega
os arquivos antes da missão e sincroniza as legendas com o áudio real. Não
precisa acessar o ElevenLabs durante a partida.

Esc pausa a cena e todo o áudio; clique na tela de pausa para retomar. Enter
avança a cinemática e interrompe suas falas, restaurando a velocidade normal
ao desembarcar. As etapas de voo acompanham o briefing, o ataque antiaéreo e
a aproximação final, que dura os trinta segundos anunciados pelo piloto.

Para gerar falas novas, defina `ELEVENLABS_API_KEY` no ambiente e execute
`npm run voices:generate`. O script reutiliza somente os áudios cujo modelo,
voz, texto e direção continuam iguais. Para refazer tudo, execute
`npm run voices:generate -- --force`. O pacote novo é ativado depois que todas
as falas foram geradas. Ele também atualiza `src/campaign/dialogue.json`,
usado para calcular a duração do voo. Não coloque a chave nos arquivos do jogo.

`npm test` verifica os áudios, o pouso e a troca de trajetórias, a câmera ao
sair da cabine, o cancelamento das vozes e a sequência de inserção com e sem
avanço rápido. Os modelos são substituídos por grupos vazios nesses testes;
o enquadramento e a aparência precisam ser verificados no navegador.
