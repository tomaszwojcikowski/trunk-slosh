import { qrMatrix } from "./qr";

export type ShareInfo = {
	grade: string;
	keptLabel: string;
	timeLabel: string;
	seedLabel: string;
	detail: string;
	url: string;
};

export function paintShareCard(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	info: ShareInfo,
) {
	ctx.fillStyle = "#e2a95f";
	ctx.fillRect(0, 0, width, height);
	ctx.strokeStyle = "#1b120b";
	ctx.lineWidth = 16;
	ctx.strokeRect(24, 24, width - 48, height - 48);
	ctx.fillStyle = "#f7ecd2";
	ctx.fillRect(48, 48, width - 96, height - 96);

	ctx.fillStyle = "#1b120b";
	ctx.font = "64px Impact, sans-serif";
	ctx.textAlign = "center";
	ctx.fillText("TRUNK SLOSH", width / 2, 150);
	ctx.font = "180px Impact, sans-serif";
	ctx.fillStyle = "#8ff04a";
	ctx.strokeStyle = "#1b120b";
	ctx.lineWidth = 10;
	ctx.strokeText(info.grade, width / 2, 360);
	ctx.fillText(info.grade, width / 2, 360);

	ctx.fillStyle = "#1b120b";
	ctx.font = "42px Trebuchet MS, sans-serif";
	ctx.fillText(`${info.keptLabel} kept · ${info.timeLabel}`, width / 2, 440);
	ctx.font = "32px Trebuchet MS, sans-serif";
	ctx.fillText(info.seedLabel, width / 2, 500);
	wrapText(ctx, info.detail, width / 2, 560, width - 160, 40);

	const modules = qrMatrix(info.url);
	const quiet = 4;
	const size = Math.min(280, width - 200);
	const cell = size / (modules.length + quiet * 2);
	const ox = (width - cell * (modules.length + quiet * 2)) / 2;
	const oy = height - 120 - cell * (modules.length + quiet * 2);
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(
		ox,
		oy,
		cell * (modules.length + quiet * 2),
		cell * (modules.length + quiet * 2),
	);
	ctx.fillStyle = "#1b120b";
	for (let y = 0; y < modules.length; y++) {
		for (let x = 0; x < modules.length; x++) {
			if (!modules[y][x]) continue;
			ctx.fillRect(
				ox + (x + quiet) * cell,
				oy + (y + quiet) * cell,
				cell,
				cell,
			);
		}
	}
	ctx.font = "22px Trebuchet MS, sans-serif";
	ctx.fillStyle = "#1b120b";
	ctx.fillText("Scan to load this run", width / 2, height - 80);
}

function wrapText(
	ctx: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	maxWidth: number,
	lineHeight: number,
) {
	const words = text.split(" ");
	let line = "";
	let yy = y;
	for (const word of words) {
		const next = line ? `${line} ${word}` : word;
		if (ctx.measureText(next).width > maxWidth && line) {
			ctx.fillText(line, x, yy);
			line = word;
			yy += lineHeight;
		} else line = next;
	}
	if (line) ctx.fillText(line, x, yy);
}

export async function deliverShareCard(
	canvas: HTMLCanvasElement,
	filename: string,
	text: string,
): Promise<"shared" | "downloaded"> {
	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error("png failed"))),
			"image/png",
		);
	});
	const file = new File([blob], filename, { type: "image/png" });
	const nav = navigator as Navigator & {
		canShare?: (data: ShareData) => boolean;
	};
	if (nav.canShare?.({ files: [file] }) && nav.share) {
		await nav.share({ files: [file], title: "Trunk Slosh", text });
		return "shared";
	}
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = filename;
	a.click();
	URL.revokeObjectURL(a.href);
	return "downloaded";
}
