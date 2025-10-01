
#ifndef __AUTEL_IR_TEMP_PARSER_H__
#define __AUTEL_IR_TEMP_PARSER_H__

#ifdef AUTEL_IRTEMPPARSER
#define AUTEL_IRTEMPPARSER __declspec(dllexport)
#else
#define AUTEL_IRTEMPPARSER __declspec(dllimport)
#endif

#include <cstdio>
#include <string.h>
#include <map>
#include <string>
#include <vector>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct
{
    uint16_t tag;
    uint16_t len;
    std::string show_value = "NA";
    char str_value[512];
    int num_value;
} Autel_IR_INFO_S;

struct QPointF
{
    int x;
    int y;

    QPointF(int _x, int _y) : x(_x), y(_y){}
};

struct TempStatInfo
{
    float max;
    float min;
    float avg;
    QPointF maxPoint;
    QPointF minPoint;
    TempStatInfo() : max(0.0), min(0.0), avg(0.0), maxPoint(0, 0), minPoint(0, 0) {}
};

/**
 * @brief get photo temperature data and info
 * @param [filepath] photo file storage path
 * @param w [input] width of photo, reference value 640
 * @param h [input] height of photo, reference value 512
 * @param tempStatInfo [output] temperature statistics info
 * @param result [output] parsed temperature info
 * @param tempArray [output] two-dimensional array of temperature data 
 * @return 0 success -1 fail
*/
AUTEL_IRTEMPPARSER int GetIrPhotoTempInfo(const char* filepath, const int w, const int h, TempStatInfo& tempStatInfo, std::map<std::string, Autel_IR_INFO_S> &result, std::vector<std::vector<float>>& tempArray);

/**
 * @brief get photo raw temperature data
 * @param [filepath] photo file storage path
 * @param w [input] width of photo, reference value 640
 * @param h [input] height of photo, reference value 512
 * @param rawTempData [output] raw temperature data array
 * @return 0 success -1 fail
*/
AUTEL_IRTEMPPARSER int GetRawTempData(const char* filepath, const int w, const int h, std::vector<int16_t> &rawTempData);

#ifdef __cplusplus
}
#endif
#endif /* __AUTEL_IR_TEMP_PARSER_H__ */

