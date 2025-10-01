#include <stdio.h>
#include "Autel_IrTempParser.h"
#pragma comment (lib, "AutelIrTempParserSDK")

int main(int argc, char *argv[])
{
	const char *filePath = "../test/IRX_0001_south.jpg";
	
	TempStatInfo statInfo;
	std::map<std::string, Autel_IR_INFO_S> mapIrInfo;
	std::vector<std::vector<float>> vecTempArray;
	if (0 == GetIrPhotoTempInfo(filePath, 640, 512, statInfo, mapIrInfo, vecTempArray))
	{
		printf("parse ok.\r\n");
	}
	else
	{
		printf("parse fail.\r\n");
	}
	return 0;
}