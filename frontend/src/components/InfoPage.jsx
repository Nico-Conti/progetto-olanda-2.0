import React from 'react';
import { Calculator, History, TrendingUp, Info } from 'lucide-react';

const InfoPage = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            {/* Header */}
            <div className="text-center space-y-4 mb-12">
                <h1 className="text-4xl font-black text-white tracking-tight">
                    Come Funzionano le <span className="text-emerald-400">Predizioni?</span>
                </h1>
                <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                    Il nostro sistema utilizza tre diversi approcci matematici per calcolare i corner previsti.
                    Ecco come funzionano nel dettaglio.
                </p>
            </div>

            {/* Models Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Historical Model */}
                <div className="glass-panel p-6 rounded-xl border border-white/10 hover:border-blue-500/30 transition-all group">
                    <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <History className="w-6 h-6 text-blue-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Media Storica</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                        Il metodo classico. Calcola la media dei corner fatti e subiti da entrambe le squadre in tutta la stagione.
                    </p>
                    <div className="bg-zinc-900/50 p-3 rounded-lg border border-white/5 text-xs font-mono text-zinc-500">
                        (Media Casa + Media Ospite) / 2
                    </div>
                </div>

                {/* Regression Model */}
                <div className="glass-panel p-6 rounded-xl border border-white/10 hover:border-purple-500/30 transition-all group">
                    <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Calculator className="w-6 h-6 text-purple-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Regressione (Forma)</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                        Un modello matematico avanzato basato sulle ultime 5 partite. Analizza quanto una squadra "spinge" davvero.
                    </p>
                    <ul className="space-y-2 text-xs text-zinc-400">
                        <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                            Box Touches (Peso: Alto)
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                            Tiri Totali (Peso: Medio)
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                            Possesso (Peso: Basso)
                        </li>
                    </ul>
                </div>

                {/* Hybrid Model */}
                <div className="glass-panel p-6 rounded-xl border border-emerald-500/20 hover:border-emerald-500/50 transition-all group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>

                    <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform relative z-10">
                        <TrendingUp className="w-6 h-6 text-emerald-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2 relative z-10">Ibrido (Consigliato)</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed mb-4 relative z-10">
                        Il meglio dei due mondi. Combina la stabilità storica con la sensibilità alla forma recente.
                    </p>
                    <div className="space-y-2 relative z-10">
                        <div className="flex items-center justify-between text-xs font-bold text-white">
                            <span>Regressione (Forma)</span>
                            <span className="text-emerald-400">60%</span>
                        </div>
                        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 w-[60%]"></div>
                        </div>
                        <div className="flex items-center justify-between text-xs font-bold text-white mt-2">
                            <span>Media Storica</span>
                            <span className="text-blue-400">40%</span>
                        </div>
                        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 w-[40%]"></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* FAQ Section */}
            <div className="glass-panel p-8 rounded-xl border border-white/10 mt-12">
                <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                    <Info className="w-6 h-6 text-zinc-400" />
                    Domande Frequenti
                </h3>
                <div className="space-y-6">
                    <div>
                        <h4 className="font-bold text-white mb-2">Perché i "Box Touches" sono importanti?</h4>
                        <p className="text-zinc-400 text-sm">
                            La nostra analisi ha dimostrato che i tocchi in area avversaria hanno una correlazione del 58% con i corner, molto più alta dei cross (19%). Più una squadra entra in area, più è probabile che ottenga un corner.
                        </p>
                    </div>
                    <div className="w-full h-px bg-white/5"></div>
                    <div>
                        <h4 className="font-bold text-white mb-2">Quando usare il modello "Regressione"?</h4>
                        <p className="text-zinc-400 text-sm">
                            Usalo quando vuoi scommettere basandoti solo sullo stato di forma attuale (ultime 5 partite). È più rischioso ma cattura meglio i trend improvvisi (es. una squadra che ha cambiato allenatore e attacca di più).
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InfoPage;
