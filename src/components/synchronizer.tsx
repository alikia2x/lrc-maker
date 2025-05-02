import SSK from "#const/session_key.json" assert { type: "json" };
import STRINGS from "#const/strings.json" assert { type: "json" };
import { convertTimeToTag, formatText, type ILyric } from "@lrc-maker/lrc-parser";
import React, {useCallback, useContext, useEffect, useRef, useState} from "react";
import {IState } from "../hooks/useLrc.js";
import { type Action, ActionType } from "../hooks/useLrc.js";
import { type State as PrefState } from "../hooks/usePref.js";
import { audioRef, currentTimePubSub } from "../utils/audiomodule.js";
import { isKeyboardElement } from "../utils/is-keyboard-element.js";
import { appContext } from "./app.context.js";
import { AsidePanel } from "./asidepanel.js";
import { Curser } from "./curser.js";
import {Backwards100, Backwards25} from "./icons/Backwards";
import {Forward100, Forward25} from "./icons/Forwards";

const SpaceButton: React.FC<{ sync: () => void }> = ({ sync }) => {
    return (
        <button className="space-button" onClick={sync}>
            space
        </button>
    );
};

export const enum SyncMode {
    select,
    highlight,
}

interface ISynchronizerProps {
    state: IState;
    dispatch: React.Dispatch<Action>;
}

export const Synchronizer: React.FC<ISynchronizerProps> = ({ state, dispatch }) => {
    const self = useRef(Symbol(Synchronizer.name));
    const [currentAudioTime, setCurrentAudioTime] = useState(0);

    const { selectIndex, currentIndex: highlightIndex, lyric } = state;

    const { prefState, lang } = useContext(appContext);

    useEffect(() => {
        dispatch({
            type: ActionType.info,
            payload: {
                name: "tool",
                value: `${lang.app.name} https://lrc-maker.github.io`,
            },
        });
    }, [dispatch, lang]);

    const [syncMode, setSyncMode] = useState(() =>
        sessionStorage.getItem(SSK.syncMode) === SyncMode.highlight.toString() ? SyncMode.highlight : SyncMode.select
    );

    useEffect(() => {
        sessionStorage.setItem(SSK.syncMode, syncMode.toString());
    }, [syncMode]);

    const ul = useRef<HTMLUListElement>(null);

    const needScrollLine = {
        [SyncMode.select]: selectIndex,
        [SyncMode.highlight]: highlightIndex,
    }[syncMode];

    useEffect(() => {
        const line = ul.current?.children[needScrollLine];
        if (line !== undefined) {
            line.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "center",
            });
        }
    }, [needScrollLine]);

    useEffect(() => {
        return currentTimePubSub.sub(self.current, (time) => {
            setCurrentAudioTime(time);
            dispatch({ type: ActionType.refresh, payload: time });
        });
    }, [dispatch]);

    const sync = useCallback(() => {
        if (!audioRef.duration) {
            return;
        }

        dispatch({
            type: ActionType.next,
            payload: audioRef.currentTime,
        });
    }, [dispatch]);

    const adjust = useCallback(
        (ev: KeyboardEvent | React.MouseEvent, offset: number, index: number) => {
            if (!audioRef.duration) {
                return;
            }

            const selectTime = lyric[index]?.time;

            if (selectTime === undefined) {
                return;
            }

            dispatch({
                type: ActionType.time,
                payload: audioRef.step(ev, offset, selectTime),
            });
        },
        [dispatch, lyric],
    );

    function moveCursor(delta: number) {
        const index = state.selectIndex;
        const line = state.lyric[state.selectIndex];
        if (!line.time) return;
        dispatch({ type: ActionType.updateLineTime, payload: { index, time: line.time + delta, audioTime: currentAudioTime } });
    }

    useEffect(() => {
        function onKeydown(ev: KeyboardEvent): void {
            const { code, key, target } = ev;

            const codeOrKey = code || key;

            if (isKeyboardElement(target)) {
                return;
            }

            if (codeOrKey === "Backspace" || codeOrKey === "Delete" || codeOrKey === "Del") {
                ev.preventDefault();
                dispatch({
                    type: ActionType.deleteTime,
                    payload: undefined,
                });
                return;
            }

            if (code === "Digit0" || key === "0") {
                ev.preventDefault();
                adjust(ev, 0, selectIndex);
                return;
            }

            if (code === "Minus" || key === "-" || key === "_") {
                ev.preventDefault();
                adjust(ev, -0.5, selectIndex);
                return;
            }

            if (code === "Equal" || key === "+" || key === "=") {
                ev.preventDefault();
                adjust(ev, 0.5, selectIndex);
                return;
            }

            if (ev.metaKey || ev.ctrlKey) {
                return;
            }

            if (code === "Space" || key === " " || key === "Spacebar") {
                ev.preventDefault();

                sync();
            } else if (["ArrowUp", "KeyW", "KeyJ", "Up", "W", "w", "J", "j"].includes(codeOrKey)) {
                ev.preventDefault();

                dispatch({ type: ActionType.select, payload: (index) => index - 1 });
            } else if (["ArrowDown", "KeyS", "KeyK", "Down", "S", "s", "K", "k"].includes(codeOrKey)) {
                ev.preventDefault();

                dispatch({ type: ActionType.select, payload: (index) => index + 1 });
            } else if (codeOrKey === "Home") {
                ev.preventDefault();

                moveCursor(0.1)
            } else if (codeOrKey === "End") {
                ev.preventDefault();

                moveCursor(-0.1)
            } else if (codeOrKey === "PageUp") {
                ev.preventDefault();

                moveCursor(0.025)
            } else if (codeOrKey === "PageDown") {
                ev.preventDefault();

                moveCursor(-0.025);
            }
        }

        document.addEventListener("keydown", onKeydown);

        return (): void => {
            document.removeEventListener("keydown", onKeydown);
        };
    }, [adjust, dispatch, selectIndex, sync]);

    const onLineClick = useCallback(
        (ev: React.MouseEvent<HTMLUListElement & HTMLLIElement>) => {
            //ev.stopPropagation();

            const target = ev.target as HTMLElement;

            if (target.classList.contains("line")) {
                const lineKey = Number.parseInt(target.dataset.key!, 10) || 0;

                dispatch({ type: ActionType.select, payload: () => lineKey });
            }
        },
        [dispatch],
    );

    const onLineDoubleClick = useCallback(
        (ev: React.MouseEvent<HTMLUListElement | HTMLLIElement>) => {
            ev.stopPropagation();

            if (!audioRef.duration) {
                return;
            }

            const target = ev.target as HTMLElement;

            if (target.classList.contains("line")) {
                const key = Number.parseInt(target.dataset.key!, 10);

                adjust(ev, 0, key);
            }
        },
        [adjust],
    );

    const LyricLineIter = useCallback(
        (line: Readonly<ILyric>, index: number, lines: readonly ILyric[]) => {
            const select = index === selectIndex;
            const highlight = index === highlightIndex;
            const error = index > 0 && lines[index].time! <= lines[index - 1].time!;

            const className = Object.entries({
                line: true,
                select,
                highlight,
                error,
            })
                .reduce<string[]>((p, [name, value]) => {
                    if (value) {
                        p.push(name);
                    }
                    return p;
                }, [])
                .join(STRINGS.space);

            return (
                <LyricLine
                    key={index}
                    index={index}
                    className={className}
                    line={line}
                    select={select}
                    prefState={prefState}
                    dispatch={dispatch}
                />
            );
        },
        [selectIndex, highlightIndex, prefState],
    );

    const ulClassName = prefState.screenButton ? "lyric-list on-screen-button" : "lyric-list";

    return (
        <>
            <ul ref={ul} className={ulClassName} onClickCapture={onLineClick} onDoubleClickCapture={onLineDoubleClick}>
                {state.lyric.map(LyricLineIter)}
            </ul>
            <AsidePanel syncMode={syncMode} setSyncMode={setSyncMode} lrcDispatch={dispatch} prefState={prefState} />
            {prefState.screenButton && <SpaceButton sync={sync} />}
        </>
    );
};

interface ILyricLineProps {
    line: ILyric;
    index: number;
    select: boolean;
    className: string;
    prefState: PrefState;
    dispatch: React.Dispatch<Action>;
}

const LyricLine: React.FC<ILyricLineProps> = ({ line, index, select, className, prefState, dispatch }) => {
    const self = useRef(Symbol(Synchronizer.name));
    const [currentAudioTime, setCurrentAudioTime] = useState(0);

    const lineTime = convertTimeToTag(line.time, prefState.fixed);

    const lineText = formatText(line.text, prefState.spaceStart, prefState.spaceEnd);

    function moveCursor(delta: number) {
        if (!line.time) return;
        dispatch({ type: ActionType.updateLineTime, payload: { index, time: line.time + delta, audioTime: currentAudioTime } });
    }

    useEffect(() => {
        return currentTimePubSub.sub(self.current, (time) => {
            setCurrentAudioTime(time);
        });
    }, [setCurrentAudioTime]);

    return (
        <li key={index} data-key={index} className={className}>
            <div>
                {select && <Curser fixed={prefState.fixed} />}
                <time className="line-time">{lineTime}</time>
                <span className="line-text">{lineText}</span>
            </div>
            <div className="move-btn-group">
                <button className="move-btn" onClick={() => moveCursor(-0.1)}>
                    <Backwards100 style={{ fontSize: "1.5rem" }} />
                </button>
                <button className="move-btn" onClick={() => moveCursor(-0.025)}>
                    <Backwards25 style={{ fontSize: "1.5rem" }} />
                </button>
                <button className="move-btn" onClick={() => moveCursor(0.025)}>
                    <Forward25 style={{ fontSize: "1.5rem" }} />
                </button>
                <button className="move-btn" onClick={() => moveCursor(0.1)}>
                    <Forward100 style={{ fontSize: "1.5rem" }} />
                </button>
            </div>
        </li>
    );
};
